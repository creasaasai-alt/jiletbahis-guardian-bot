# CORE ARCHITECTURE: Domain Tip (BTK) Bot

## 1. Sistemin Amacı
Bu sistem, bahis sitelerinin (Örn: JiletBahis) giriş adreslerine Türkiye Bilgi Teknolojileri ve İletişim Kurumu (BTK) tarafından getirilen erişim engellerini anında tespit etmek ve Telegram üzerinden bildirim göndermek için tasarlanmıştır.

## 2. DNS Zehirlenmesi Tespiti (DNS Poisoning Detection)
Sistem, domain kontrolünü yurt dışı IP'lerinden yapmak yerine, doğrudan Türkiye'deki internet servis sağlayıcılarının (İSS) DNS sunucularını kullanarak yapar.
- **Kullanılan DNS:** Türk Telekom (`195.175.39.39`)
- **BTK Engel IP'si:** `195.175.254.2`
- **Mekanizma:** Sistemin `dns.service.ts` modülü, aktif domaini TTNET DNS'ine sorar. Eğer TTNET, domainin IP'sinin `195.175.254.2` olduğunu söylerse, o domaine **Erişim Engeli (BTK)** gelmiş demektir.

## 3. Otomatik Geçiş ve Bekleme Sistemi (State Machine)
Sistem 3 temel state (durum) üzerinden çalışır:
1. `OK` (Normal İzleme): Domain aktiftir ve TTNET DNS'leri üzerinden gerçek IP döndürüyordur. Her 1 dakikada bir taranır.
2. `PENDING` (Geçiş Bekleniyor): Domain patlamış (BTK engeli yemiş) ve hedef domain (Örn: `102`'den `103`'e) hesaplanmıştır. Sağlayıcının `103`'ü aktif etmesi beklenir.
3. `RE_ALERT` (Gecikme Uyarı Modu): Domain patlayalı 15 dakika olmasına rağmen sağlayıcı yeni domaini devreye almamışsa sistem alarm verir.

## 4. Dosya Yapısı
- `src/bot.ts`: Telegram bot entegrasyonu, State Machine yönetimi.
- `src/services/dns.service.ts`: TTNET DNS sorgulama motoru.
- `src/services/domain.service.ts`: Domain ismi manipülasyonu (sayı artırma/azaltma) ve JSON State okuma/yazma.
- `docs/STATE.md`: Sistem state'inin ve aktif domainin tutulduğu canlı veri dosyası.
- `docs/templates/`: Telegram bildirim şablonları.
