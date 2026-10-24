# QuizBot AI — Telegram Mini App va viktorina boti

Telegram guruhlari uchun AI viktorina boti. **Admin** va **Super Admin** — alohida oynalar.

| Kim | Qayerdan kiradi | Himoya |
|---|---|---|
| Guruh admini | Botda `/panel` yoki menyudagi **Panel** tugmasi → `/` | Guruhni `/link KOD` bilan ulagan bo'lishi kerak |
| Super Admin | Botda `/owner` yoki menyudagi **Super Admin** tugmasi → `/owner.html` | Telegram ID `SUPER_ADMIN_IDS` ro'yxatida bo'lishi kerak (serverda tekshiriladi) |

Admin oynasida Super Admin tugmasi **yo'q**, Admin bundle'ida Super Admin kodi ham yo'q. `/owner` buyrug'iga boshqalarga javob berilmaydi, `/owner.html`ni ochsa ham server 403 qaytaradi.

## 1. Bot yaratish (BotFather)
1. `/newbot` — bot yarating, **token** oling.
2. `/mybots` → botingiz → **Bot Settings → Group Privacy → Turn off** (tavsiya).
3. Telegram ID'ingizni bilish uchun `@userinfobot` ga yozing.

## 2. Netlify'ga deploy
1. Zip'ni GitHub'ga yuklab Netlify'ga ulang **yoki** Netlify CLI: `npx netlify deploy --build --prod`.
   (Funksiyalar bor, shuning uchun oddiy "drag & drop" papka yuklash ishlamaydi — Git yoki CLI kerak.)
2. **Site configuration → Environment variables**:
   - `BOT_TOKEN` — BotFather tokeni
   - `SUPER_ADMIN_IDS` — sizning Telegram ID'ingiz (bir nechta bo'lsa vergul bilan)
   - `GEMINI_API_KEY` — Google AI Studio kaliti
   - ixtiyoriy: `GEMINI_MODEL` (standart `gemini-2.5-flash`), `SITE_URL`
3. Env o'zgaruvchilarni qo'shgach **qayta deploy** qiling.

## 3. Botni ulash (bir marta)
1. Botga shaxsiy chatda `/owner` yozing → **Super Admin panelini ochish**.
2. **Umumiy** bo'limida **🔌 Botni ulash (webhook)** tugmasini bosing. Hamma "Tizim holati" qatorlari yashil bo'lishi kerak.

## 4. Guruhni ulash
1. Super Admin paneli → **Kodlar → Yangi ulanish kodi** (kod faqat bir marta ko'rsatiladi, 48 soat amal qiladi).
2. Kodni guruh adminiga yuboring. Admin botni guruhga qo'shib **admin** qiladi (xabarlarni o'chirish, a'zolarni cheklash, taklif qilish huquqlari bilan).
3. Admin guruhda yozadi: `/link QZ-XXXX-XXXX`. Faqat guruhning haqiqiy admini ulay oladi.
4. Admin botga `/panel` yozadi → panel ochiladi.

## Qanday ishlaydi
- Quiz savollari guruhga **ketma-ket**, har biri non-anonymous Quiz Poll bo'lib yuboriladi. Keyingi savol oldingisi yopilganda Telegram yuboradigan yangilanish bilan yuboriladi (kutish uchun funksiya ishlamaydi → kredit sarflanmaydi).
- Natijalar: +1 ball to'g'ri javobga, tezlik uchun +0.5 gacha bonus. Tenglikda: ko'p to'g'ri javob, keyin kam vaqt.
- G'oliblar guruhda ism bilan tegiladi va har biriga **sertifikat havolasi** (`/cert.html`) beriladi — sertifikat brauzerda chiziladi va PNG qilib yuklab olinadi.
- Rejalashtirilgan quizlar va "tiqilib qolgan" quizlarni tiklash uchun har 5 daqiqada yengil `cron` ishlaydi (bitta kichik yozuvni o'qiydi, ish bo'lmasa darhol tugaydi).
- Barcha statistika **noldan** boshlanadi. Ma'lumotlar Netlify Blobs'da saqlanadi.

## Netlify kreditini tejash
- Faqat bitta API funksiyasi, bitta webhook, bitta cron (5 daqiqa).
- Har bir ishtirokchi javobi = 1 ta webhook chaqiruvi (natijani hisoblash uchun zarur).
- Anti-spam yoqilsa, guruhdagi har bir xabar tekshiriladi — katta guruhlarda chaqiruvlar ko'payadi. Shuning uchun u **standart holatda o'chiq**.
- Cron chastotasini o'zgartirish: `netlify/functions/cron.ts` oxiridagi `schedule`.

## Muammolar
- *Panel "Telegram orqali oching" deydi* — oddiy brauzerda emas, bot ichida oching.
- *Owner "Ruxsat yo'q"* — `SUPER_ADMIN_IDS`da ID to'g'riligini va `BOT_TOKEN` borligini tekshiring, qayta deploy qiling.
- *Guruhga yuborib bo'lmadi* — bot guruhda admin ekanini tekshiring.
- *Quiz savollari orasida to'xtab qoldi* — 5 daqiqagacha ichida cron o'zi davom ettiradi.

## Hozircha yo'q (keyingi qadamlar)
Takrorlanuvchi (har kuni/haftada) quizlar, haftalik reytinglar, shaxsiy chatda AI "xatolar tahlili" (hozir saqlangan izohlar bilan), sertifikatni guruhga rasm sifatida yuborish.
