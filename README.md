# QuizBot AI — Telegram Mini App va viktorina boti

Telegram guruhlari uchun istalgan fandan AI viktorina boti (faqat o'zbek tilida). **Admin** va **Super Admin** — alohida oynalar.

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
   - tavsiya: `MINIAPP_SHORTNAME` — sertifikat tugmasi "Open this link?" oynasisiz ochilishi uchun (pastga qarang)
3. Env o'zgaruvchilarni qo'shgach **qayta deploy** qiling.

## 3. Botni ulash (bir marta)
1. Botga shaxsiy chatda `/owner` yozing → **Super Admin panelini ochish**.
2. **Umumiy** bo'limida **🔌 Botni ulash (webhook)** tugmasini bosing. Hamma "Tizim holati" qatorlari yashil bo'lishi kerak.

## 4. Guruhni ulash
1. Super Admin paneli → **Kodlar → Yangi ulanish kodi** (kod faqat bir marta ko'rsatiladi, 48 soat amal qiladi).
2. Kodni guruh adminiga yuboring. Admin botni guruhga qo'shib **admin** qiladi (xabarlarni o'chirish, a'zolarni cheklash, taklif qilish huquqlari bilan).
3. Admin guruhda yozadi: `/link QZ-XXXX-XXXX`. Faqat guruhning haqiqiy admini ulay oladi.
4. Admin botga `/panel` yozadi → panel ochiladi.

## Sertifikat tugmasi oynasiz ochilishi uchun (bir martalik)
1. BotFather → `/newapp` → botingizni tanlang → Web App URL: `https://SIZNING-SAYT.netlify.app/` → qisqa nom (masalan `panel`).
2. Netlify env: `MINIAPP_SHORTNAME=panel` → qayta deploy.
Shundan keyin g'oliblar tugmani bosganda sertifikat Telegram ichida to'g'ridan-to'g'ri ochiladi.

## Qanday ishlaydi
- Savollar guruhga ketma-ket yuboriladi. Admin har bir savol vaqtini (5–600 soniya) o'zi belgilaydi. Vaqt tugashi bilan keyingi savol **avtomatik** yuboriladi: quiz davomida kichik fon funksiyasi (`quiz-runner-background`) kutib turadi va aynan vaqtida uyg'onadi.
- Natijalar: +1 ball to'g'ri javobga, tezlik uchun +0.5 gacha bonus. Tenglikda: ko'p to'g'ri javob, keyin kam vaqt.
- Top-N o'rin olganlar (kamida 1 ta to'g'ri javob bilan) guruhda ism bilan tegiladi va har biriga sertifikat tugmasi beriladi. Sertifikat brauzerda chiziladi (fan nomi yozilmaydi).
- Reklama: faqat Super Admin yaratgan matn (rasm/tugma bilan yoki usiz) quiz natijalaridan keyin yuboriladi, hech qanday qo'shimcha yozuvsiz.
- Rejalashtirilgan quizlarni boshlash uchun har 5 daqiqada yengil `cron` ishlaydi (bitta kichik yozuvni o'qiydi, ish bo'lmasa darhol tugaydi).
- Barcha statistika **noldan** boshlanadi. Ma'lumotlar Netlify Blobs'da saqlanadi.

## Netlify kreditini tejash
- Ish faqat quiz paytida sarflanadi: har ishtirokchi javobi = 1 ta qisqa chaqiruv, va quiz davomida bitta fon funksiyasi kutib turadi (masalan 10 savol × 30 s ≈ 5 daqiqa).
- Quiz bo'lmaganda faqat 5 daqiqalik cron ishlaydi (oyiga ~8 600 juda qisqa chaqiruv). Rejalashtirilgan quizlardan foydalanmasangiz, `netlify/functions/cron.ts` dagi `schedule`ni `0 * * * *` (soatiga bir) qilib, deyarli nolga tushirishingiz mumkin.
- Anti-spam yoqilsa, guruhdagi har bir xabar tekshiriladi, shuning uchun u **standart holatda o'chiq**.

## Muammolar
- *Panel "Telegram orqali oching" deydi* — oddiy brauzerda emas, bot ichida oching.
- *Owner "Ruxsat yo'q"* — `SUPER_ADMIN_IDS`da ID to'g'riligini va `BOT_TOKEN` borligini tekshiring, qayta deploy qiling.
- *Guruhga yuborib bo'lmadi* — bot guruhda admin ekanini tekshiring.
- *Quiz savollari orasida to'xtab qoldi* — cron 1,5–5 daqiqada fon funksiyasini qayta ishga tushiradi. Doim takrorlansa, Netlify → Functions bo'limida `quiz-runner-background` ko'rinishini tekshiring.
- *Eski deploydan keyin* — Super Admin panelida **Webhook va buyruqlarni qayta o'rnatish** tugmasini bosing.

## Hozircha yo'q (keyingi qadamlar)
Takrorlanuvchi (har kuni/haftada) quizlar, haftalik reytinglar, sertifikatni guruhga tayyor rasm sifatida yuborish.
