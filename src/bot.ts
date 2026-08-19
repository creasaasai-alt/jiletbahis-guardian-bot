import 'dotenv/config';
import { Telegraf } from 'telegraf';
import cron from 'node-cron';
import http from 'http';
import { DnsService } from './services/dns.service';
import { DomainService } from './services/domain.service';

const botToken = process.env.BOT_TOKEN;
const topicId = process.env.TOPIC_ID ? parseInt(process.env.TOPIC_ID, 10) : undefined;
const groupId = process.env.GROUP_ID;

if (!botToken || !groupId) {
  console.error("HATA: BOT_TOKEN veya GROUP_ID .env dosyasında bulunamadı.");
  process.exit(1);
}

const bot = new Telegraf(botToken);

// --- BİLDİRİM ŞABLONLARI ---

const sendBlockedAlert = async (oldDomain: string, targetDomain: string) => {
  const message = `🚨 **Giriş Adresi Güncellemesi**\n\n` +
                  `Mevcut giriş adresimize (\`${oldDomain}\`) BTK tarafından erişim engeli getirilmiştir. Kesintisiz erişiminiz için yeni adresimize geçiş işlemleri an itibarıyla başlatıldı.\n\n` +
                  `⏳ _Lütfen yeni adresin aktif edilmesini bekleyiniz._`;
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
  const message = `⚠️ **Geçiş Süreci Devam Ediyor**\n\n` +
                  `Yeni adresimizin (\`${targetDomain}\`) global ağlara yansıması beklenmektedir. Bağlantı güvenliği sağlandığında anında bilgilendirme yapılacaktır.`;
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
  const message = `✅ **Yeni Giriş Adresimiz Aktif!**\n\n` +
                  `Adres güncelleme işlemi başarıyla tamamlanmıştır. JiletBahis kalitesiyle işlemlerinize kaldığınız yerden güvenle devam edebilirsiniz.\n\n` +
                  `🌐 **WEB:** https://${newDomain}/tr/\n` +
                  `📱 **MOBİL:** https://m.${newDomain}/tr/`;
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
      // 1. Önce BTK Engeli Var Mı? (En Önemlisi)
      const isBlocked = await DnsService.isDomainBlockedByBTK(state.currentDomain);
      
      if (isBlocked) {
        console.log(`🚨 DİKKAT: ${state.currentDomain} BTK tarafından engellendi!`);
        
        const nextDomain = DomainService.getNextDomain(state.currentDomain, 1);
        state.currentState = 'PENDING';
        state.pendingDomain = nextDomain; // Sadece log/info için
        state.blockedAt = now.toISOString();
        DomainService.saveState(state);

        await sendBlockedAlert(state.currentDomain, nextDomain);
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
      // Geçiş bekleniyor durumu: Lookahead 20 (İleri Gözlem) Taraması
      if (!state.blockedAt) return;
      
      let foundActiveDomain = null;
      
      // Sağlayıcı 103 yerine 105'i bile açsa hemen bulmak için +1'den +20'ye kadar tara
      for (let i = 1; i <= 20; i++) {
        const testDomain = DomainService.getNextDomain(state.currentDomain, i);
        // Hem DNS aktif mi (BTK yememiş ve IP dönüyor) hem de sunucu 200 dönüyor mu?
        if (await DnsService.isDomainActive(testDomain) && await DnsService.isServerHealthy(testDomain)) {
          foundActiveDomain = testDomain;
          break; // Bulduk, çık
        }
      }

      if (foundActiveDomain) {
        console.log(`✅ YENİ DOMAİN AKTİF (LOOKAHEAD): ${foundActiveDomain}`);
        
        await sendSuccessAlert(foundActiveDomain);
        
        state.currentDomain = foundActiveDomain;
        state.currentState = 'OK';
        state.pendingDomain = null;
        state.blockedAt = null;
        DomainService.saveState(state);
      } 
      else {
        // Hedeflerden hiçbiri aktif değil. Süreyi kontrol et.
        const blockedTime = new Date(state.blockedAt).getTime();
        const diffMinutes = (now.getTime() - blockedTime) / (1000 * 60);

        if (diffMinutes >= 15 && state.currentState === 'PENDING') {
          // Gecikme uyarısında tahmini domaini (current + 1) gösteriyoruz
          const expectedNext = DomainService.getNextDomain(state.currentDomain, 1);
          console.log(`⚠️ 15 DAKİKA GEÇTİ, SAĞLAYICI GECİKTİ: Beklenen ${expectedNext}`);
          
          await sendDelayAlert(expectedNext);
          
          state.currentState = 'RE_ALERT';
          DomainService.saveState(state);
        }
      }
    }
  } catch (error) {
    console.error("Cron Job Hatası:", error);
  }
});

// Admin komutları
bot.command('status', async (ctx) => {
  const state = DomainService.getState();
  let msg = `🛠️ **Sistem Durumu:**\n\n`;
  msg += `👉 **Aktif Domain:** \`${state.currentDomain}\`\n`;
  msg += `⚙️ **Durum:** \`${state.currentState}\`\n`;
  if (state.pendingDomain) {
    msg += `⏳ **Beklenen Domain:** \`${state.pendingDomain}\`\n`;
  }
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// Adminlerin test etmesi için manuel tetikleyici
// Adminlerin mesaj tasarımlarını görmesi için Test Önizleme (Preview) komutu
bot.command('testengel', async (ctx) => {
  console.log("TEST KOMUTU GELDİ!");
  
  const state = DomainService.getState();
  const current = state.currentDomain;
  const next = DomainService.getNextDomain(current);

  await ctx.reply("⚠️ **TEST MODU BAŞLADI:** Aşağıdaki mesajlar sadece tasarım önizlemesidir. Sistem hafızası değiştirilmedi.", { parse_mode: 'Markdown' });

  // 1. Patlama Alarmını Yolla
  await sendBlockedAlert(current, next);

  // 2. Birkaç saniye sonra Gecikme Uyarısını Yolla
  setTimeout(async () => {
    await sendDelayAlert(next);
  }, 2000);

  // 3. Birkaç saniye sonra Başarı Mesajını Yolla
  setTimeout(async () => {
    await sendSuccessAlert(next);
    await ctx.reply("✅ **TEST BİTTİ:** Sistemin güncel domaini hala `" + current + "` olarak korunuyor.", { parse_mode: 'Markdown' });
  }, 4000);
});

// Bot başlatılmadan önce Akıllı Tarama (Auto-Discovery) yaparak gerçek domaini bulur
const initializeSystem = async () => {
  const state = DomainService.getState();
  let current = state.currentDomain;

  console.log(`🔍 Başlangıç taraması yapılıyor... Kayıtlı domain: ${current}`);
  
  // Eğer sunucu yeniden başlarsa ve eski domain hafızada kalmışsa, sessizce güncel olanı bulana kadar tarar.
  let isBlocked = await DnsService.isDomainBlockedByBTK(current);
  while (isBlocked) {
    console.log(`❌ ${current} engelli. Bir sonrakine bakılıyor...`);
    current = DomainService.getNextDomain(current);
    isBlocked = await DnsService.isDomainBlockedByBTK(current);
  }

  if (current !== state.currentDomain) {
    console.log(`✅ Akıllı Tarama: Güncel aktif domain ${current} olarak tespit edildi ve hafıza güncellendi!`);
    state.currentDomain = current;
    state.currentState = 'OK';
    state.pendingDomain = null;
    DomainService.saveState(state);
  } else {
    console.log(`✅ Sistem güncel. İzlenen domain: ${current}`);
  }

  // Tarama bittikten sonra botu başlat
  bot.launch().then(() => {
    console.log("🛡️ Domain Tip Botu başarıyla başlatıldı ve DNS izleme devrede...");
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
