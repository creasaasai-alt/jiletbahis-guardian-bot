export declare class DnsService {
    /**
     * Belirtilen domainin BTK tarafından engellenip engellenmediğini 3 ana DNS'ten eşzamanlı sorgular.
     * Eğer herhangi biri "Erişim Engeli" (BTK IP'si) döndürürse, site patlamıştır.
     */
    static isDomainBlockedByBTK(domain: string): Promise<boolean>;
    /**
     * Belirtilen domainin aktif ve çözümlenebilir olup olmadığını kontrol eder.
     */
    static isDomainActive(domain: string): Promise<boolean>;
    /**
     * Domainin HTTP(s) seviyesinde yayında olup olmadığını kontrol eder. (Çökmüş mü?)
     * 200, 301, 302 vs dönerse site hayattadır. TimeOut, 502, 522 dönerse ölüdür.
     */
    static isServerHealthy(domain: string): Promise<boolean>;
}
//# sourceMappingURL=dns.service.d.ts.map