import 'dotenv/config';
import { Telegraf } from 'telegraf';
import cron from 'node-cron';
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

// --- OTOMATİK TAKİP VE STATE MACHINE (CRON) ---

// Her 1 dakikada bir çalışacak
cron.schedule('* * * * *', async () => {
  const state = DomainService.getState();
  const now = new Date();

  try {
    if (state.currentState === 'OK') {
      // Normal izleme: Aktif domain patlamış mı?
      const isBlocked = await DnsService.isDomainBlockedByBTK(state.currentDomain);
      
      if (isBlocked) {
        console.log(`🚨 DİKKAT: ${state.currentDomain} BTK tarafından engellendi!`);
        
        // Hedef domaini hesapla
        const nextDomain = DomainService.getNextDomain(state.currentDomain);
        
        // State'i güncelle
        state.currentState = 'PENDING';
        state.pendingDomain = nextDomain;
        state.blockedAt = now.toISOString();
        DomainService.saveState(state);

        // Bildirim at
        await sendBlockedAlert(state.currentDomain, nextDomain);
      }
    } 
    else if (state.currentState === 'PENDING' || state.currentState === 'RE_ALERT') {
      // Geçiş bekleniyor durumu: Hedef domain aktif oldu mu?
      if (!state.pendingDomain || !state.blockedAt) return;

      const isTargetActive = await DnsService.isDomainActive(state.pendingDomain);

      if (isTargetActive) {
        console.log(`✅ YENİ DOMAİN AKTİF: ${state.pendingDomain}`);
        
        // Başarı bildirimini at
        await sendSuccessAlert(state.pendingDomain);
        
        // State'i güncelle ve normale dön
        state.currentDomain = state.pendingDomain;
        state.currentState = 'OK';
        state.pendingDomain = null;
        state.blockedAt = null;
        DomainService.saveState(state);
      } 
      else {
        // Hedef henüz aktif değil. Süreyi kontrol et. (15 dakika = 15 * 60 * 1000 ms)
        const blockedTime = new Date(state.blockedAt).getTime();
        const diffMinutes = (now.getTime() - blockedTime) / (1000 * 60);

        if (diffMinutes >= 15 && state.currentState === 'PENDING') {
          console.log(`⚠️ 15 DAKİKA GEÇTİ, SAĞLAYICI GECİKTİ: ${state.pendingDomain}`);
          
          // Gecikme uyarısı at
          await sendDelayAlert(state.pendingDomain);
          
          // Aynı uyarıyı tekrar tekrar atmamak için state'i RE_ALERT yap
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
bot.command('testengel', async (ctx) => {
  const state = DomainService.getState();
  if (state.currentState !== 'OK') {
    return ctx.reply("Zaten bir geçiş süreci devam ediyor.");
  }
  
  const nextDomain = DomainService.getNextDomain(state.currentDomain);
  state.currentState = 'PENDING';
  state.pendingDomain = nextDomain;
  state.blockedAt = new Date().toISOString();
  DomainService.saveState(state);

  await sendBlockedAlert(state.currentDomain, nextDomain);
  ctx.reply("⚠️ Test engeli simüle edildi. Sistem PENDING moduna geçti.");
});

bot.launch().then(() => {
  console.log("🛡️ Domain Tip Botu başarıyla başlatıldı ve DNS izleme devrede...");
});

// Kapanış sinyallerini yakala
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
