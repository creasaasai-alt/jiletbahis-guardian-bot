import dns from 'dns';
import axios from 'axios';

// Türkiye'nin Dev 3 ISP'sinin DNS Sunucuları
const ISP_SERVERS = {
  'TTNET': '195.175.39.39',
  'TURKCELL': '212.252.114.8',
  'VODAFONE': '213.194.71.98'
};

// BTK'nın engellenmiş siteleri yönlendirdiği IP (Uyarı Sayfası)
const BTK_BLOCK_IP = '195.175.254.2';

// Her bir ISP için özel resolver'lar oluşturuyoruz
const resolvers = Object.entries(ISP_SERVERS).map(([name, ip]) => {
  const r = new dns.promises.Resolver();
  r.setServers([ip]);
  return { name, resolver: r };
});

export class DnsService {
  /**
   * Belirtilen domainin BTK tarafından engellenip engellenmediğini 3 ana DNS'ten eşzamanlı sorgular.
   * Eğer herhangi biri "Erişim Engeli" (BTK IP'si) döndürürse, site patlamıştır.
   */
  static async isDomainBlockedByBTK(domain: string): Promise<boolean> {
    try {
      // 3 sağlayıcıya aynı anda (Promise.all) sorgu atıyoruz.
      const queries = resolvers.map(async ({ name, resolver }) => {
        try {
          const addresses = await resolver.resolve4(domain);
          if (addresses.includes(BTK_BLOCK_IP)) {
            // console.log(`[İSTİHBARAT] ${name} DNS üzerinden BTK engeli tespit edildi!`);
            return true;
          }
        } catch (e) {
          // Bir DNS geçici hata verirse diğerlerini bozmaması için hatayı yutuyoruz.
        }
        return false;
      });

      const results = await Promise.all(queries);
      
      // Eğer 3 sunucudan en az 1 tanesi "BTK Engeli Var (true)" dediyse, site patlamıştır!
      return results.some(isBlocked => isBlocked === true);

    } catch (error: any) {
      console.error(`DNS Çözümleme Hatası (${domain}):`, error.message);
      return false; 
    }
  }

  /**
   * Belirtilen domainin aktif ve çözümlenebilir olup olmadığını kontrol eder.
   */
  static async isDomainActive(domain: string): Promise<boolean> {
    try {
      // Sadece TTNET'e bakmak bile aktifliği doğrulamak için yeterlidir.
      const addresses = await resolvers[0].resolver.resolve4(domain);
      if (addresses.length > 0 && !addresses.includes(BTK_BLOCK_IP)) {
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Domainin HTTP(s) seviyesinde yayında olup olmadığını kontrol eder. (Çökmüş mü?)
   * 200, 301, 302 vs dönerse site hayattadır. TimeOut, 502, 522 dönerse ölüdür.
   */
  static async isServerHealthy(domain: string): Promise<boolean> {
    try {
      // Sadece sayfanın başlığını (HEAD) çekeriz, tüm siteyi indirip yormayız.
      await axios.head(`https://${domain}`, { timeout: 7000 });
      return true;
    } catch (error: any) {
      // SSL hatası, Timeout, Cloudflare (502) gibi hatalar buraya düşer.
      return false;
    }
  }
}
