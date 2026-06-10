# UNDERCOVER Combined Modular Bot

Satu repo untuk 3 sistem:

- Order Robux: `src/orderRobux.js`
- Live TikTok: `src/liveTikTok.js`
- Welcome/Goodbye: `src/welcomeGoodbye.js`

`index.js` hanya membuat satu Discord client, memasang tiga modul, lalu menjalankan satu `client.login()`.

## Struktur

```txt
undercover-combined-modular-bot/
├─ index.js
├─ package.json
├─ .env.example
├─ src/
│  ├─ orderRobux.js
│  ├─ liveTikTok.js
│  └─ welcomeGoodbye.js
├─ assets/
│  └─ fonts/
│     ├─ Poppins-Regular.ttf
│     └─ Poppins-Bold.ttf
└─ invoices/
```

## Jalankan lokal

```bash
npm install
npm start
```

## Railway

Start command:

```bash
npm start
```

Masukkan semua variable dari `.env` ke Railway Variables.

## Catatan font

Untuk tampilan banner TikTok dan welcome/goodbye tetap sama, copy font lama ke:

```txt
assets/fonts/Poppins-Regular.ttf
assets/fonts/Poppins-Bold.ttf
```

## Security

Jangan upload `.env` ke GitHub publik. Pakai `.env.example` untuk template, lalu isi secret di Railway Variables.
