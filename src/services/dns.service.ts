import dns from 'dns';
import axios from 'axios';

// Türkiye'nin 3 büyük ISP DNS Sunucusu
export const ISP_LIST = [
  { name: 'TTNET',    emoji: '🟠', server: '195.175.39.39'  },
  { name: 'Turkcell', emoji: '💛', server: '212.252.114.8'  },
  { name: 'Vodafone', emoji: '🔴', server: '213.194.71.98'  },
];

// BTK engel yönlendirme IP'leri
const BTK_BLOCK_IPS = ['195.175.254.2', '195.175.254.3', '195.175.254.254'];

// DNS sorgusu için timeout (ms)
const DNS_TIMEOUT_MS = 5000;

export type IspStatus = 'BLOCKED' | 'OK' | 'TIMEOUT';

export interface IspResult {
  name: string;
  emoji: string;
  status: IspStatus;
}

export interface DnsCheckResult {
  results: IspResult[];
  isAnyBlocked: boolean;      // En az 1 ISP'de engel var mı?
  isConfirmedBlocked: boolean; // En az 1 ISP cevap verdi VE engelli mi?
  blockedCount: number;
  respondedCount: number;
}

/**
 * Tek bir ISP DNS sunucusuna sorgu atar, sonucu IspStatus olarak döner.
 */
const querySingleISP = async (server: string, domain: string): Promise<IspStatus> => {
  try {
    const resolver = new dns.promises.Resolver({ timeout: DNS_TIMEOUT_MS });
    resolver.setServers([server]);
    const addresses = await resolver.resolve4(domain);
    const isBlocked = addresses.some(ip => BTK_BLOCK_IPS.includes(ip));
    return isBlocked ? 'BLOCKED' : 'OK';
  } catch {
    return 'TIMEOUT';
  }
};

export class DnsService {
  /**
   * Tüm ISP'leri eş zamanlı sorgular, her birinin durumunu ayrı ayrı döner.
   */
  static async checkAllISPs(domain: string): Promise<DnsCheckResult> {
    const promises = ISP_LIST.map(async (isp) => {
      const status = await querySingleISP(isp.server, domain);
      console.log(`[DNS:${isp.name}] ${domain} -> ${status}`);
      return { name: isp.name, emoji: isp.emoji, status } as IspResult;
    });

    const results = await Promise.all(promises);
    const responded = results.filter(r => r.status !== 'TIMEOUT');
    const blocked   = results.filter(r => r.status === 'BLOCKED');

    return {
      results,
      isAnyBlocked:       blocked.length > 0,
      isConfirmedBlocked: responded.length > 0 && blocked.length > 0,
      blockedCount:       blocked.length,
      respondedCount:     responded.length,
    };
  }

  /**
   * Kısayol: Domain BTK tarafından en az 1 ISP'de engellendi mi?
   * Eğer hiçbir ISP cevap vermediyse (tüm timeout) false döner (yanlış alarm önlenir).
   */
  static async isDomainBlockedByBTK(domain: string): Promise<boolean> {
    const check = await DnsService.checkAllISPs(domain);
    if (check.respondedCount === 0) {
      console.log(`[DNS:UYARI] Hiçbir ISP ${domain} için cevap vermedi. Yanlış alarm önlendi.`);
      return false;
    }
    return check.isConfirmedBlocked;
  }

  /**
   * Domain TTNET üzerinden ulaşılabilir mi? (Engel yok + gerçek IP dönüyor)
   */
  static async isDomainActive(domain: string): Promise<boolean> {
    const status = await querySingleISP(ISP_LIST[0].server, domain);
    return status === 'OK';
  }

  /**
   * Domainin HTTP(s) katmanında sağlıklı cevap verip vermediğini kontrol eder.
   */
  static async isServerHealthy(domain: string): Promise<boolean> {
    try {
      await axios.head(`https://${domain}`, {
        timeout: 8000,
        maxRedirects: 3,
        validateStatus: (s) => s < 600,
      });
      return true;
    } catch {
      return false;
    }
  }
}
