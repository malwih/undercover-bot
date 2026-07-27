PASANG QRIS STATIS SHOPEEPAY MERCHANT ANDA DI FOLDER INI.

Nama file default:
qris-shopeepay-static.png

Path default:
./assets/qris-shopeepay-static.png

Format didukung:
.png, .jpg, .jpeg, .webp

QRIS dikenakan biaya admin 1% secara otomatis.
Contoh: Rp100.000 menjadi Rp101.000.

Staff dapat mengaktifkan atau menonaktifkan metode dengan:
/enable metode:SeaBank
/enable metode:QRIS ShopeePay
/disable metode:SeaBank
/disable metode:QRIS ShopeePay

Bukti pembayaran QRIS otomatis dikirim juga ke TESTIMONI_CHANNEL_ID.
Bukti SeaBank tidak dikirim ke channel testimoni.

PENTING:
- Gunakan QRIS asli merchant Anda.
- Jangan menggunakan QR placeholder.
- Pastikan bot memiliki permission Attach Files di channel testimoni.
