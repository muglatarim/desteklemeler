# Çiftçi Destek Sorgulama Sistemi

Bu uygulama, çiftçilerin kendilerine ait destekleme ödemelerini TC Kimlik veya Vergi Numarası ile sorgulayabilmelerini sağlayan web tabanlı bir sistemdir. Veriler Firebase Realtime Database üzerinde güvenli bir şekilde saklanır.

## Özellikler

- **Hızlı Sorgulama**: TC/VKN ile anında sonuç.
- **Güvenlik**: Hassas veriler (TC No) veritabanına şifrelenmiş (Hashed) olarak kaydedilir.
- **Admin Paneli**: Excel dosyalarından veri yükleme, sütun eşleştirme ve görünürlük ayarları.
- **Sürükle-Bırak**: Destek türlerini admin panelinde istenilen sıraya göre düzenleme.
- **Çoklu Kayıt Desteği**: Bir TC numarasına ait birden fazla işletme kaydını gösterebilme.

## Teknolojiler

- React + TypeScript
- Vite
- Firebase Realtime Database & Authentication
- Tailwind CSS

## Kurulum

1. Depoyu kopyalayın:
   ```bash
   git clone https://github.com/kullanici-adi/desteklemeler.git
   cd desteklemeler
   ```

2. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

3. `.env` dosyasını oluşturun ve Firebase bilgilerinizi ekleyin (Örnek `.env.example` dosyasını kullanabilirsiniz):
   ```env
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_DATABASE_URL=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_FIREBASE_MEASUREMENT_ID=...
   ```

4. Uygulamayı başlatın:
   ```bash
   npm run dev
   ```

## Firebase Kuralları (Rules)

Güvenli çalışma için Realtime Database kurallarınızı aşağıdaki gibi güncelleyin:

```json
{
  "rules": {
    "support_types": {
      ".read": true,
      ".write": "auth != null"
    },
    "data": {
      ".read": true,
      ".write": "auth != null"
    }
  }
}
```

## Dağıtım (Deployment)

Proje `GitHub Pages` uyumlu olacak şekilde yapılandırılmıştır. `npm run build` komutu çıktıları `docs` klasörüne yazar. GitHub repo ayarlarından Pages klasörü olarak `docs` seçilmelidir.

```bash
npm run build
```

---
*Muğla İl Tarım ve Orman Müdürlüğü için geliştirilmiştir.*
