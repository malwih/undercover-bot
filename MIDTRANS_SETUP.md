# Setup Pembayaran UNDERCOVER Bot — SeaBank + Midtrans QRIS

Order Robux sekarang memiliki **dua metode pembayaran** dan keduanya tetap aktif:

1. **Transfer SeaBank (manual)**
   - Customer memilih tombol `Transfer SeaBank`.
   - Bot menampilkan rekening SeaBank dan nominal sesuai rate dasar.
   - Customer transfer lalu upload bukti pembayaran di ticket.
   - Bot menandai bukti sudah masuk dan staff/owner mengecek pembayaran.
   - Staff melanjutkan pengiriman Robux seperti flow lama.

2. **QRIS Midtrans (otomatis)**
   - Customer memilih tombol `Bayar QRIS`.
   - Bot membuat QRIS dinamis khusus order tersebut menggunakan Midtrans Core API.
   - Nominal QRIS dihitung agar target bersih rate tetap aman, kemudian dibulatkan **ke atas** ke kelipatan `PAYMENT_ROUND_TO`.
   - Status transaksi dicek melalui webhook dan fallback polling.
   - Saat Midtrans mengembalikan transaksi sukses, order berubah menjadi `PAID` otomatis dan staff dipanggil.
   - Customer tidak perlu upload bukti pembayaran untuk QRIS.

> Metode pembayaran dikunci setelah customer memilih salah satu metode. Jika salah memilih, customer harus close order lalu membuat order baru. Ini mencegah satu order mempunyai dua pembayaran yang ambigu.

## Harga

Rate dasar:

```env
PRICE_PER_1000=100000
```

Contoh 10.000 Robux:
- Transfer SeaBank: Rp1.000.000.
- QRIS: bot menghitung dari target bersih, memakai `MIDTRANS_MDR_PERCENT`, lalu membulatkan ke atas sesuai `PAYMENT_ROUND_TO`.

## Konfigurasi `.env`

Bagian SeaBank tetap dipakai:

```env
SEABANK_ACCOUNT=ISI_NOMOR_REKENING
SEABANK_NAME=ISI_NAMA_PEMILIK
```

Bagian Midtrans:

```env
MIDTRANS_SERVER_KEY=ISI_SERVER_KEY_MIDTRANS
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_QRIS_ACQUIRER=gopay
MIDTRANS_MDR_PERCENT=0.7
PAYMENT_ROUND_TO=1000
MIDTRANS_STATUS_POLL_SECONDS=20
MIDTRANS_WEBHOOK_ENABLED=true
MIDTRANS_WEBHOOK_HOST=0.0.0.0
MIDTRANS_WEBHOOK_PORT=
MIDTRANS_WEBHOOK_PATH=/midtrans/notification
MIDTRANS_NOTIFICATION_URL=
```

Keterangan:
- `MIDTRANS_SERVER_KEY`: Server Key dari Midtrans Dashboard. Rahasiakan; jangan kirim ke Discord atau commit ke repository publik.
- `MIDTRANS_IS_PRODUCTION=false`: Sandbox/test. Ubah menjadi `true` hanya setelah akun Production aktif dan Server Key sudah diganti ke key Production.
- `MIDTRANS_QRIS_ACQUIRER=gopay`: acquirer QRIS yang dipakai oleh request Core API bot.
- `MIDTRANS_MDR_PERCENT`: angka potongan efektif yang dipakai **untuk kalkulasi harga QRIS bot**. Default 0.7 hanya baseline. Untuk production, sesuaikan dengan rate final akun merchant, kategori gaming/digital product, pajak/biaya yang benar-benar memengaruhi settlement.
- `PAYMENT_ROUND_TO=1000`: hasil checkout QRIS selalu dibulatkan ke atas ke ribuan terdekat.
- `MIDTRANS_STATUS_POLL_SECONDS=20`: fallback pengecekan status otomatis.
- `MIDTRANS_WEBHOOK_ENABLED=true`: aktifkan HTTP server webhook.
- `MIDTRANS_WEBHOOK_PORT`: kosong = pakai `PORT` hosting, fallback 3000.
- `MIDTRANS_WEBHOOK_PATH=/midtrans/notification`: path callback.
- `MIDTRANS_NOTIFICATION_URL`: isi URL HTTPS publik callback bila tersedia.

## Setup Midtrans Sandbox

1. Login ke Midtrans Merchant Dashboard.
2. Pastikan environment **Sandbox**.
3. Buka **Settings > Access Keys**.
4. Copy **Server Key Sandbox**.
5. Isi:
   ```env
   MIDTRANS_SERVER_KEY=SB-Mid-server-...
   MIDTRANS_IS_PRODUCTION=false
   ```
6. Restart bot:
   ```bash
   npm install
   npm start
   ```
7. Buat order test dan pilih **Bayar QRIS**.
8. Gunakan simulator Sandbox Midtrans untuk mensimulasikan pembayaran.
9. Pastikan bot mengubah order QRIS menjadi `PAID`.

## Webhook

Bot menyediakan:

```text
POST /midtrans/notification
GET  /health
```

Production sebaiknya memakai endpoint HTTPS publik, contoh:

```text
https://bot.domainanda.com/midtrans/notification
```

Isi:

```env
MIDTRANS_NOTIFICATION_URL=https://bot.domainanda.com/midtrans/notification
```

Bot memverifikasi `signature_key` Midtrans dan juga memiliki polling status sebagai fallback.

## Beralih ke Production

Setelah onboarding Midtrans disetujui dan QRIS aktif:

1. Ubah dashboard Midtrans ke **Production**.
2. Ambil **Server Key Production** (berbeda dari Sandbox).
3. Ubah `.env`:
   ```env
   MIDTRANS_SERVER_KEY=Mid-server-...
   MIDTRANS_IS_PRODUCTION=true
   ```
4. Pastikan Notification URL Production mengarah ke endpoint HTTPS bot dan memberikan HTTP 200.
5. Sesuaikan `MIDTRANS_MDR_PERCENT` dengan rate efektif/final merchant Anda.
6. Restart bot dan lakukan transaksi live kecil untuk verifikasi end-to-end.

## Flow status

SeaBank:
```text
AWAITING_PAYMENT
  -> AWAITING_PROOF
  -> PROOF_SUBMITTED
  -> DONE
```

QRIS:
```text
AWAITING_PAYMENT
  -> QRIS_PENDING
  -> PAID
  -> DONE
```

Jika timeout/cancel:
```text
-> EXPIRED / CANCELLED
```
