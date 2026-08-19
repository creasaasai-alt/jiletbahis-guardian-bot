import dns from 'dns';

// Türk Telekom DNS Sunucusu
const TTNET_DNS = '195.175.39.39';

// BTK'nın engellenmiş siteleri yönlendirdiği IP (Uyarı Sayfası)
const BTK_BLOCK_IP = '195.175.254.2';

// Özel resolver oluşturuyoruz ki, sunucunun (Render) kendi DNS'ini değil,
// Türkiye'deki Türk Telekom DNS'ini kullansın.
const resolver = new dns.promises.Resolver();
resolver.setServers([TTNET_DNS]);

export class DnsService {
  /**
   * Belirtilen domainin BTK tarafından engellenip engellenmediğini kontrol eder.
   * @param domain Kontrol edilecek domain (Örn: jiletbahis102.com)
   * @returns BTK engelliyse true, değilse false döner.
   */
  static async isDomainBlockedByBTK(domain: string): Promise<boolean> {
    try {
      const addresses = await resolver.resolve4(domain);
      
      // Çıkan IP'lerin içinde BTK'nın block IP'si var mı kontrol et
      const isBlocked = addresses.includes(BTK_BLOCK_IP);
      return isBlocked;
    } catch (error: any) {
      // Eğer domain hiç bulunamazsa (ENOTFOUND), bu da sitenin kapalı/patlamış olduğu anlamına gelebilir.
      // Ancak BTK engelleri genelde belirli bir IP'ye yönlendirir.
      console.error(`DNS Çözümleme Hatası (${domain}):`, error.message);
      
      // Sunucu taraflı geçici hatalara karşı false dönüp, asılsız alarmı önlüyoruz.
      return false; 
    }
  }

  /**
   * Belirtilen domainin aktif ve çözümlenebilir olup olmadığını kontrol eder.
   * (Yeni domaine geçerken, hedefin hazır olup olmadığını anlamak için kullanılır)
   */
  static async isDomainActive(domain: string): Promise<boolean> {
    try {
      const addresses = await resolver.resolve4(domain);
      // Hem çözümlenmiş bir IP olmalı hem de BTK blok IP'si olMAMALI
      if (addresses.length > 0 && !addresses.includes(BTK_BLOCK_IP)) {
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }
}
