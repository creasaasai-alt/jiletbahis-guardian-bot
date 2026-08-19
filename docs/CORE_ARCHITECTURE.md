# CORE ARCHITECTURE: Domain Tip (BTK) Bot

## 1. Sistemin Amacı
Bu sistem, bahis sitelerinin (Örn: JiletBahis) giriş adreslerine Türkiye Bilgi Teknolojileri ve İletişim Kurumu (BTK) tarafından getirilen erişim engellerini anında tespit etmek ve Telegram üzerinden bildirim göndermek için tasarlanmıştır.

## 2. Zeki Tehdit Algılama (Multi-DNS ve HTTP Çökme Tespiti)
Sistem, domain kontrolünü yurt dışı IP'lerinden yapmak yerine doğrudan Türkiye'nin dev İnternet Servis Sağlayıcılarının (İSS) DNS sunucularından yapar.
- **Aktif DNS Ağı:** 
  - TTNET (Türk Telekom): `195.175.39.39`
  - Turkcell Superonline: `212.252.114.8`
  - Vodafone Türkiye: `213.194.71.98`
- **BTK Engel IP'si:** `195.175.254.2`
- **Mekanizma:** `dns.service.ts` modülü bu 3 DNS'e eşzamanlı sorgu atar. Hangisi "Erişim Engeli" kararı aldıysa (BTK IP'sine yönlendiriyorsa), sistem anında alarm verir.
- **HTTP Çökme Tespiti:** DNS temiz dönse bile siteye `axios` ile HTTP isteği atılır. Eğer sunucu (Cloudflare vb.) kapalıysa, BTK engelinden ayrı olarak "Sistem Çöktü/Bakımda" alarmı verilir.

## 3. Otomatik Geçiş ve Lookahead (İleri Gözlem) Sistemi
Sistem 4 temel state (durum) üzerinden çalışır:
1. `OK` (Normal İzleme): Domain aktiftir ve TTNET/Turkcell DNS'leri üzerinden gerçek IP döndürüp HTTP 200 veriyordur.
2. `SERVER_DOWN` (Sunucu Kapalı): Domain engelli değil ama site çökmüş/bakımdadır.
3. `PENDING` (Geçiş Bekleniyor): Domain patlamış (BTK engeli yemiş). Hedef domain aranır. 
   > **Lookahead 20 Özelliği:** Sağlayıcı domaini `102`'den yanlışlıkla `108`'e atlatırsa diye, sistem +1'den +20'ye kadar tüm ileri domainleri eşzamanlı tarar.
4. `RE_ALERT` (Gecikme Uyarı Modu): Domain patlayalı 15 dakika olmasına rağmen sağlayıcı yeni domaini devreye almamışsa sistem alarm verir.

## 4. Dosya Yapısı
- `src/bot.ts`: Telegram bot entegrasyonu, State Machine yönetimi.
- `src/services/dns.service.ts`: TTNET DNS sorgulama motoru.
- `src/services/domain.service.ts`: Domain ismi manipülasyonu (sayı artırma/azaltma) ve JSON State okuma/yazma.
- `docs/STATE.md`: Sistem state'inin ve aktif domainin tutulduğu canlı veri dosyası.
- `docs/templates/`: Telegram bildirim şablonları.
