import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { Telegraf } from 'telegraf';
import cron from 'node-cron';
import http from 'http';
import { DnsService, DnsCheckResult } from './services/dns.service';
import { DomainService } from './services/domain.service';

// STATE dosyasının kesin yolunu VPS'te de çalışacak şekilde belirle
const STATE_PATH = path.resolve(process.cwd(), 'docs/STATE.json');
console.log(`[INIT] STATE dosyası: ${STATE_PATH}`);


const botToken = process.env.BOT_TOKEN;
const topicId = process.env.TOPIC_ID ? parseInt(process.env.TOPIC_ID, 10) : undefined;
const groupId = process.env.GROUP_ID;

if (!botToken || !groupId) {
  console.error("HATA: BOT_TOKEN veya GROUP_ID .env dosyasında bulunamadı.");
  process.exit(1);
}

const bot = new Telegraf(botToken);

// --- İÇ EKİP (OPERASYON) ODAKLI BİLDİRİM ŞABLONLARI ---

const sendBlockedAlert = async (oldDomain: string, targetDomain: string, dnsCheck?: DnsCheckResult) => {
  let ispDetails = '';
  if (dnsCheck && dnsCheck.results) {
    dnsCheck.results.forEach((r) => {
      let statusStr = '⚠️ ZAMAN AŞIMI';
      if (r.status === 'BLOCKED') statusStr = '❌ ENGELLİ';
      if (r.status === 'OK') statusStr = '✅ AÇIK';
      ispDetails += `${r.emoji} **${r.name}:** ${statusStr}\n`;
    });
  } else {
    ispDetails = `🟠 **TTNET:** ❌ ENGELLİ\n💛 **Turkcell:** ❌ ENGELLİ\n🔴 **Vodafone:** ❌ ENGELLİ\n`; // Test için fallback
  }

  const message = `🚨 **BTK ENGELİ TESPİT EDİLDİ!**\n\n` +
                  `İzlenen domain (\`${oldDomain}\`) an itibarıyla patlamıştır.\n\n` +
                  `**İstihbarat Raporu:**\n${ispDetails}\n` +
                  `⚠️ **AKSİYON GEREKİYOR:** Lütfen acilen \`${targetDomain}\` adresine geçişi sağlayıp DNS yönlendirmelerini yapınız!`;
  try {
    await bot.telegram.sendMessage(groupId, message, {
      parse_mode: 'Markdown',
      message_thread_id: topicId
    });
  } catch (error) {
    console.error("İLK ALARM gönderilemedi:", error);
  }
};

const sendDelayAlert = async (targetDomain: string) => {
  const message = `⚠️ **HATIRLATMA: GEÇİŞ BEKLENİYOR**\n\n` +
                  `Mevcut domain hala engelli durumda. Yeni adresin (\`${targetDomain}\`) aktif olması (HTTP 200) bekleniyor.\n\n` +
                  `Lütfen yönlendirmelerin yapıldığından emin olunuz. 2 saatte bir durum kontrolü yapılacaktır.`;
  try {
    await bot.telegram.sendMessage(groupId, message, {
      parse_mode: 'Markdown',
      message_thread_id: topicId
    });
  } catch (error) {
    console.error("GECİKME UYARISI gönderilemedi:", error);
  }
};

const sendSuccessAlert = async (newDomain: string) => {
  const message = `✅ **GEÇİŞ TAMAMLANDI - YENİ ADRES AKTİF**\n\n` +
                  `Sistemlerimiz \`${newDomain}\` adresinin global olarak yayına girdiğini ve sağlıklı (HTTP 200) yanıt verdiğini teyit etmiştir.\n\n` +
                  `Nöbete devam ediliyor 🛡️`;
  try {
    await bot.telegram.sendMessage(groupId, message, {
      parse_mode: 'Markdown',
      message_thread_id: topicId,
      link_preview_options: { is_disabled: true }
    });
  } catch (error) {
    console.error("BAŞARILI GEÇİŞ bildirimi gönderilemedi:", error);
  }
};

const sendServerDownAlert = async () => {
  const message = `⚠️ **Sistem Erişimi Kesintisi**\n\n` +
                  `Sunucularımıza bağlantı şu anda kurulamıyor. Teknik ekibimiz sorunu inceliyor, lütfen bekleyiniz.`;
  try {
    await bot.telegram.sendMessage(groupId, message, {
      parse_mode: 'Markdown',
      message_thread_id: topicId
    });
  } catch (error) {
    console.error("SUNUCU ÇÖKME bildirimi gönderilemedi:", error);
  }
};

const sendServerRecoveryAlert = async (domain: string) => {
  const message = `✅ **Sistem Erişimi Sağlandı**\n\n` +
                  `Sunucularımızdaki erişim sorunu giderilmiştir. Güncel adresimiz (\`${domain}\`) üzerinden işlemlerinize devam edebilirsiniz.`;
  try {
    await bot.telegram.sendMessage(groupId, message, {
      parse_mode: 'Markdown',
      message_thread_id: topicId
    });
  } catch (error) {
    console.error("SUNUCU KURTARMA bildirimi gönderilemedi:", error);
  }
};

// --- OTOMATİK TAKİP VE STATE MACHINE (CRON) ---

// Her 1 dakikada bir çalışacak
cron.schedule('* * * * *', async () => {
  const state = DomainService.getState();
  const now = new Date();

  try {
    if (state.currentState === 'OK' || state.currentState === 'SERVER_DOWN') {
      // 1. Önce BTK Engeli Var Mı? (Detaylı ISP Testi)
      const dnsCheck = await DnsService.checkAllISPs(state.currentDomain);
      
      // Hiçbir DNS sunucusu cevap vermiyorsa yanlış alarm üretme
      if (dnsCheck.respondedCount > 0 && dnsCheck.isConfirmedBlocked) {
        console.log(`🚨 DİKKAT: ${state.currentDomain} BTK tarafından engellendi!`);
        
        const nextDomain = DomainService.getNextDomain(state.currentDomain, 1);
        state.currentState = 'PENDING';
        state.pendingDomain = nextDomain; 
        state.blockedAt = now.toISOString();
        state.lastAlertAt = now.toISOString();
        DomainService.saveState(state);

        await sendBlockedAlert(state.currentDomain, nextDomain, dnsCheck);
        return; // İşlem bitti, devam etme
      }
      
      // 2. BTK Engeli yoksa sunucu hayatta mı? (HTTP Check)
      const isHealthy = await DnsService.isServerHealthy(state.currentDomain);
      
      if (!isHealthy && state.currentState === 'OK') {
        console.log(`⚠️ SUNUCU ÇÖKTÜ: ${state.currentDomain} HTTP 200 dönmüyor!`);
        state.currentState = 'SERVER_DOWN';
        DomainService.saveState(state);
        await sendServerDownAlert();
      } 
      else if (isHealthy && state.currentState === 'SERVER_DOWN') {
        console.log(`✅ SUNUCU GERİ GELDİ: ${state.currentDomain}`);
        state.currentState = 'OK';
        DomainService.saveState(state);
        await sendServerRecoveryAlert(state.currentDomain);
      }
    } 
    else if (state.currentState === 'PENDING' || state.currentState === 'RE_ALERT') {
      // Geçiş bekleniyor: İleri Gözlem Taraması (Lookahead)
      if (!state.blockedAt) return;
      
      let foundActiveDomain = null;
      
      // Yazılımcı 103 yerine 105'i bile açsa hemen bulmak için +1'den +10'a kadar tara
      for (let i = 1; i <= 10; i++) {
        const testDomain = DomainService.getNextDomain(state.currentDomain, i);
        // Hem DNS aktif mi (BTK yememiş) hem de sunucu GERÇEKTEN 200 dönüyor mu? (404 veya 522 DEĞİL)
        if (await DnsService.isDomainActive(testDomain) && await DnsService.isServerHealthy(testDomain)) {
          foundActiveDomain = testDomain;
          break;
        }
      }

      if (foundActiveDomain) {
        console.log(`✅ YENİ DOMAİN GERÇEKTEN AKTİF OLDU: ${foundActiveDomain}`);
        
        await sendSuccessAlert(foundActiveDomain);
        
        state.currentDomain = foundActiveDomain;
        state.currentState = 'OK';
        state.pendingDomain = null;
        state.blockedAt = null;
        state.lastAlertAt = null;
        DomainService.saveState(state);
      } 
      else {
        // Yeni sunucu henüz aktif değil (ya Cloudflare 404 dönüyor, ya da DNS ayarlanmamış).
        // 2 Saatte bir uyarı gönder (120 dakika)
        const lastAlertTime = state.lastAlertAt ? new Date(state.lastAlertAt).getTime() : new Date(state.blockedAt).getTime();
        const diffMinutes = (now.getTime() - lastAlertTime) / (1000 * 60);

        if (diffMinutes >= 120) {
          const expectedNext = state.pendingDomain || DomainService.getNextDomain(state.currentDomain, 1);
          console.log(`⚠️ 2 SAAT GEÇTİ, SAĞLAYICI HALA GECİKİYOR: Beklenen ${expectedNext}`);
          
          await sendDelayAlert(expectedNext);
          
          state.currentState = 'RE_ALERT';
          state.lastAlertAt = now.toISOString();
          DomainService.saveState(state);
        }
      }
    }
  } catch (error) {
    console.error("Cron Job Hatası:", error);
  }
});

// Her 6 saatte bir rutin rapor atacak (00:00, 06:00, 12:00, 18:00)
cron.schedule('0 0,6,12,18 * * *', async () => {
  const state = DomainService.getState();
  if (state.currentState !== 'OK') return; // Sadece sistem normalse rutin rapor at
  
  const message = `🛡️ **GUARDIAN RUTİN SİSTEM RAPORU**\n\n` +
                  `👉 **İzlenen Domain:** \`${state.currentDomain}\`\n` +
                  `⚙️ **Durum:** Sağlıklı (Nöbete Devam)\n\n` +
                  `Sistem 7/24 aktif. BTK ağında herhangi bir anomali tespit edilmemiştir.`;
  try {
    await bot.telegram.sendMessage(groupId, message, {
      parse_mode: 'Markdown',
      message_thread_id: topicId
    });
  } catch (error) {
    console.error("RUTİN RAPOR gönderilemedi:", error);
  }
});

// Admin komutları
bot.command(['status', 'test'], async (ctx) => {
  const state = DomainService.getState();
  const isAdmin = ctx.chat.id.toString() === groupId ||
                  ctx.from?.username === 'ElyonOps' ||
                  (ctx.message as any)?.from?.id?.toString() === process.env.ADMIN_ID;

  let msg = `🛠️ **Sistem Kontrolü (Radar Aktif)**\n\n`;
  msg += `👉 **İzlenen Domain:** \`${state.currentDomain}\`\n`;
  msg += `⚙️ **Sistem Durumu:** \`${state.currentState}\`\n`;
  if (state.pendingDomain) {
    msg += `⏳ **Beklenen (Hedef) Domain:** \`${state.pendingDomain}\`\n`;
  }
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// Manuel domain değiştirme komutu (/setdomain jiletbahis103.com)
bot.command('setdomain', async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    await ctx.reply('❌ Kullanım: /setdomain jiletbahis103.com');
    return;
  }
  const newDomain = args[1].trim().toLowerCase();
  if (!newDomain.includes('jiletbahis')) {
    await ctx.reply('❌ Geçersiz domain. "jiletbahis" içermeli.');
    return;
  }
  const state = DomainService.getState();
  const oldDomain = state.currentDomain;
  state.currentDomain = newDomain;
  state.currentState = 'OK';
  state.pendingDomain = null;
  state.blockedAt = null;
  DomainService.saveState(state);
  await ctx.reply(`✅ Domain güncellendi!\n\n\`${oldDomain}\` → \`${newDomain}\`\n\nBot artık yeni domaini izliyor.`, { parse_mode: 'Markdown' });
  console.log(`[SETDOMAIN] ${oldDomain} -> ${newDomain}`);
});


// BTK Engeli simülasyonu
bot.command('testdomain', async (ctx) => {
  const state = DomainService.getState();
  const current = state.currentDomain;
  const next = DomainService.getNextDomain(current);

  await ctx.reply("⚠️ **TEST ÖNİZLEME:** İç ekip formatlı BTK Engeli uyarıları gösteriliyor...", { parse_mode: 'Markdown' });

  // 1. Patlama Alarmını Yolla
  await sendBlockedAlert(current, next);

  // 2. Birkaç saniye sonra Gecikme Uyarısını Yolla
  setTimeout(async () => {
    await sendDelayAlert(next);
  }, 2000);

  // 3. Birkaç saniye sonra Başarı Mesajını Yolla
  setTimeout(async () => {
    await sendSuccessAlert(next);
  }, 4000);
});

// Sunucu Çökme simülasyonu
bot.command('testcokme', async (ctx) => {
  const state = DomainService.getState();
  const current = state.currentDomain;

  await ctx.reply("⚠️ **TEST ÖNİZLEME:** Sunucu Çökme ve Kurtarma uyarıları gösteriliyor...", { parse_mode: 'Markdown' });

  await sendServerDownAlert();

  setTimeout(async () => {
    await sendServerRecoveryAlert(current);
  }, 3000);
});

// Bot başlatılmadan önce STATE kontrolü yap
const initializeSystem = async () => {
  // docs/ klasörü yoksa yarat
  const docsDir = path.dirname(STATE_PATH);
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
    console.log(`[INIT] docs/ klasörü oluşturuldu: ${docsDir}`);
  }

  const state = DomainService.getState();
  console.log(`🔍 Bot başlıyor... Şu an izlenen domain: ${state.currentDomain} | Durum: ${state.currentState}`);
  // DIKKAT: Otomatik geçiş /setdomain komutu iptal edildi,
  // çünkü artık sistem 404 ve 522'leri ayırıyor. Otomatik şekilde, yazılımcı backend'i gerçekten 200 yapana kadar 
  // bekleyip, 200'ü gördüğü saniye "Geçiş Tamamlandı" diyebilecek zekaya ulaştı.
  console.log("Manuel komutlara son. Tam otomatik sistem aktif.");

  bot.launch().then(() => {
    console.log('🛡️ Domain Tip Botu başarıyla başlatıldı ve DNS izleme devrede...');
  });
};

initializeSystem();

// Render Web Service İçin Dummy HTTP Sunucusu (Render'ın botu kapatmasını engeller)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('JiletBahis Domain Radar Bot is Alive!\n');
}).listen(PORT, () => {
  console.log(`🌐 Dummy Web Sunucusu ${PORT} portunda çalışıyor (Render Uyumluluğu)`);
});

// Kapanış sinyallerini yakala
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
