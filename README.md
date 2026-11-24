# Dishify (versi web / PWA)

Dishify membantu kamu memutuskan mau masak apa. Ketik bahan yang sudah ada di dapur atau bahan yang sedang ingin kamu makan, lalu AI Gemini membuatkan 5 resep sederhana yang berbeda-beda. Aplikasi ini bisa dibuka di browser dan bisa **diinstal** seperti aplikasi biasa (PWA).

Fitur:

- Satu layar dengan empat kondisi: awal, sedang memasak (loading), hasil, dan error. Hasilnya 5 resep: resep pertama langsung terbuka, dan resep lainnya dibuka dengan *Show recipe*.
- **I cook in**: pilih negaramu, supaya bahan dan perkiraan harga mengikuti negaramu (misalnya Rp15.000 untuk Indonesia).
- **Today's situation**: pilih satu kondisi nyata, yaitu *No limits*, *Only 15 minutes*, *Rice cooker only*, atau *No stove*. Resep akan menyesuaikan.
- **Keep it within my budget**: centang kalau ingin membatasi biaya, lalu isi batas maksimal per masakan dalam mata uang negaramu (misalnya IDR 25.000 atau USD 7.50). Bisa digabung dengan situasi mana pun. Tanpa budget, bahan yang kamu ketik dianggap sudah ada di dapur. Dengan budget, bahan itu dianggap yang ingin kamu masak (misalnya "ayam"), dan biaya membelinya ikut dihitung.
- **swap**: di setiap bahan pada resep ada tautan kecil *swap*. Klik kalau kamu tidak punya bahan itu, lalu Gemini menyarankan sampai 3 pengganti, dengan bahan dari kulkasmu didahulukan (bertanda *in your fridge*).
- **Resep favorit**: klik ikon hati di sebelah judul resep untuk menyimpannya. Semua resep tersimpan bisa dibuka lewat tombol **Saved** di bagian atas, bahkan tanpa internet. Resep tersimpan ada di browser masing-masing perangkat.
- **My fridge**: catat bahan di kulkasmu dan berapa lama bahan itu tahan (tombol − dan +). Nama bahan boleh dalam bahasa apa pun. Untuk bahan umum dalam bahasa Inggris/Indonesia, perkiraannya langsung muncul. Untuk bahasa atau bahan lain, Dishify menanyakannya ke Gemini. Bahan ditempel sebagai label di rak: *Past its date*, *Use today*, *Use in the next 2 days*, dan *Still fresh*. Tombol *Cook with these* mengisi kolom bahan dari isi kulkas, mulai dari yang paling cepat basi, dan Gemini diminta memakai bahan itu lebih dulu. Data kulkas tersimpan di browser masing-masing perangkat.
- **Read the steps**: langkah memasak dibacakan dengan suara, lengkap dengan tombol *Pause*, *Resume*, dan *Stop*.
- **Lebar bisa diatur** (di laptop): tarik pegangan hijau di garis antara sisi kiri dan kanan. Klik dua kali pegangannya untuk kembali ke lebar awal. Tampilan tetap seimbang dan berada di tengah saat halaman di-zoom in atau zoom out.
- Bisa diinstal ke layar utama laptop (dan HP, lihat catatan di bawah).

---

## Menjalankan di Windows (dari nol)

### Langkah 1: Pasang Python (sekali saja)

1. Buka https://www.python.org/downloads/ lalu unduh **Python 3.10 atau yang lebih baru**.
2. Jalankan pemasangnya. **Penting:** centang kotak **"Add python.exe to PATH"** di layar pertama, lalu klik *Install Now*.
3. Untuk mengecek: buka **Command Prompt** (tekan tombol Windows, ketik `cmd`, Enter), lalu ketik:
   ```
   py --version
   ```
   Kalau muncul tulisan seperti `Python 3.12.x`, berarti Python sudah siap.

### Langkah 2: Buat API key Gemini yang baru

1. Buka https://aistudio.google.com/app/apikey dan masuk dengan akun Google.
2. Klik **Create API key**, lalu salin key-nya.
3. Simpan key itu baik-baik. Jangan dibagikan dan jangan ditulis di dalam kode.

> Key lama yang tertulis di aplikasi Flutter (`main.dart`) sebaiknya **dihapus** di halaman yang sama, karena key itu pernah tertulis langsung di dalam kode.

### Langkah 3: Jalankan Dishify

**Cara paling mudah:** buka folder `dishify-pwa`, lalu **klik dua kali `start.bat`**.

- Saat pertama kali dijalankan, file ini akan memasang paket yang dibutuhkan (perlu internet, sekitar 1 menit). Lalu Notepad terbuka berisi file `.env`.
- Di Notepad, tempel key kamu tepat setelah `GEMINI_API_KEY=`, contohnya:
  ```
  GEMINI_API_KEY=key-kamu-di-sini
  ```
  Simpan dengan **Ctrl+S**, lalu tutup Notepad.
- Akan muncul jendela hitam bertuliskan *Dishify is running*. **Biarkan jendela itu terbuka.**
- Buka **Chrome** atau **Edge**, lalu ketik alamat: **http://localhost:5000**

Untuk menjalankannya lagi lain waktu, cukup klik dua kali `start.bat`.

Untuk mematikan: klik jendela hitam tadi, tekan **Ctrl+C**, lalu tutup jendelanya.

<details>
<summary>Cara manual lewat Command Prompt (kalau tidak mau memakai start.bat)</summary>

```
cd C:\Users\LENOVO\tugas2\dishify-pwa
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env
notepad .env
.venv\Scripts\python app.py
```
Baris 2 sampai 5 cukup dijalankan sekali. Setelah itu, untuk menyalakan Dishify cukup jalankan baris pertama dan terakhir.
</details>

### Langkah 4: Instal sebagai aplikasi (PWA)

Buka http://localhost:5000 di Chrome atau Edge, lalu:

- **Chrome**: klik ikon **Instal** (layar dengan panah ke bawah) di ujung kanan kolom alamat, lalu pilih *Install*.
- **Edge**: klik menu **...**, lalu pilih *Apps*, lalu *Install this site as an app*.

Dishify akan muncul di Start Menu dan desktop seperti aplikasi biasa. **Catatan:** server (jendela hitam dari `start.bat`) tetap harus menyala, karena resep dibuat oleh server.

---

## Memasang online (Render) supaya bisa dibuka dan diinstal dari HP

Proyek ini sudah disiapkan untuk **Render** (gratis, tanpa kartu kredit). File `render.yaml` berisi semua pengaturannya, jadi kamu cukup memilih repo dan mengisi API key.

1. Buka https://render.com, lalu daftar atau masuk memakai **akun GitHub**-mu.
2. Klik **New → Blueprint**, lalu pilih repo **dishify**.
3. Render akan menanyakan **GEMINI_API_KEY**. Tempel key Gemini-mu di sana (key ini disimpan rahasia oleh Render, tidak masuk GitHub).
4. Klik **Apply** atau **Deploy**, lalu tunggu beberapa menit sampai statusnya **Live**.
5. Buka alamat yang diberikan Render (misalnya `https://dishify-xxxx.onrender.com`) di Chrome HP, lalu pilih **Add to Home screen / Install app**.

Hal yang perlu diketahui:
- **Situs "tidur" kalau 15 menit tidak dipakai.** Pembukaan berikutnya butuh sekitar 1 menit untuk bangun. Setelah itu normal lagi.
- **Update otomatis.** Setiap kali kamu push perubahan lewat GitHub Desktop, Render memasang versi barunya sendiri.
- **Alamatnya publik.** Siapa pun yang tahu alamatnya bisa memakai Dishify, dan pemakaiannya memakai kuota Gemini-mu. Batas per pengunjung tetap berlaku.

## Membuka dari HP

- **Memakai saja (tanpa instal)**: laptop dan HP harus tersambung ke Wi-Fi yang sama.
  1. Di file `.env`, ubah `HOST=127.0.0.1` menjadi `HOST=0.0.0.0`, lalu jalankan ulang Dishify. Kalau Windows bertanya soal firewall, izinkan untuk jaringan *Private*.
  2. Cari alamat IP laptop: di Command Prompt ketik `ipconfig`, lalu lihat baris **IPv4 Address** (misalnya `192.168.1.5`).
  3. Di HP, buka `http://192.168.1.5:5000`.
- **Instal ke layar utama HP**: browser hanya mengizinkan instalasi dari alamat **https://**. Pakai alamat Render (lihat bagian di atas). Lewat alamat `http://192.168...`, aplikasi tetap bisa dipakai, tapi tidak bisa diinstal.

---

## Menjalankan tes otomatis

Tes memeriksa fitur inti: cek input, batas permintaan, isi prompt, pembacaan jawaban Gemini, dan memastikan key tidak pernah terkirim ke browser. Tes **tidak** memanggil Gemini sungguhan, jadi tidak memakai kuota dan tidak butuh key.

```
cd C:\Users\LENOVO\tugas2\dishify-pwa
.venv\Scripts\python -m pytest
```
Kalau semuanya lulus, akan muncul tulisan seperti `67 passed`.

---

## Kalau ada masalah

| Yang terlihat | Yang perlu dilakukan |
|---|---|
| Jendela hitam menulis `WARNING: This is a development server` | Normal. Abaikan saja, karena Dishify memang dipakai di laptop sendiri. |
| `'py' is not recognized` atau "Python belum terpasang" | Pasang Python lagi dan centang **Add python.exe to PATH**. |
| Di aplikasi muncul "Dishify isn't set up yet" | Key belum diisi. Buka `.env`, isi `GEMINI_API_KEY=`, simpan, lalu jalankan ulang `start.bat`. |
| "The Gemini API key was rejected" | Key salah atau sudah dihapus. Buat key baru (Langkah 2). |
| "The AI has reached its usage limit" | Kuota gratis Gemini habis untuk sementara. Coba lagi nanti. |
| "You're going a bit fast…" | Batas permintaan Dishify tercapai. Tunggu sesuai detik yang tertulis. Batasnya bisa diubah di `.env`. |
| "Can't reach Dishify…" | Jendela hitam (server) tertutup. Jalankan `start.bat` lagi. |
| Jendela hitam menulis `Address already in use` | Dishify sudah jalan di jendela lain, atau port 5000 dipakai aplikasi lain. Tutup jendela itu atau ganti `PORT=5001` di `.env`. |
| Pemasangan paket gagal di tengah jalan | Hapus folder `.venv`, pastikan internet menyala, lalu jalankan `start.bat` lagi. |
| Tombol *Read the steps* tidak muncul | Browser tidak mendukung suara. Pakai Chrome atau Edge terbaru. |

---

## Isi folder (untuk yang penasaran)

```
dishify-pwa/
├── start.bat              ← klik dua kali untuk menjalankan
├── app.py                 ← server: menyajikan halaman + menjawab permintaan resep
├── dishify/               ← bagian server
│   ├── config.py          ← membaca pengaturan dari .env
│   ├── countries.py       ← daftar negara, mata uang, dan budget bawaan
│   ├── prompts.py         ← prompt ke Gemini (resep, lama simpan bahan, pengganti bahan)
│   ├── validation.py      ← cek input (kosong, terlalu panjang, pilihan tidak dikenal)
│   ├── rate_limit.py      ← batas jumlah permintaan per pengguna
│   └── gemini_service.py  ← memanggil Gemini dan merapikan jawabannya
├── static/                ← semua yang tampil di browser
│   ├── index.html
│   ├── css/style.css      ← warna & tampilan
│   ├── js/texts.js        ← SEMUA TEKS TAMPILAN (ubah di sini untuk ganti bahasa)
│   ├── js/app.js          ← mengatur layar (awal, loading, hasil, error)
│   ├── js/api.js          ← menghubungi server
│   ├── js/speech.js       ← fitur "Read the steps"
│   ├── js/storage.js      ← menyimpan data di browser (negara, budget, isi kulkas)
│   ├── js/pantry.js       ← logika "My fridge": tanggal, status kesegaran, daftar lama simpan bahan umum
│   ├── js/fridge.js       ← tampilan panel "My fridge"
│   ├── js/favorites.js    ← resep favorit (ikon hati)
│   ├── js/icons.js        ← ikon-ikon kecil
│   ├── js/layout.js       ← pegangan untuk mengatur lebar sisi kiri/kanan
│   ├── manifest.webmanifest, sw.js, icons/  ← agar bisa diinstal (PWA)
├── tests/                 ← tes otomatis
├── requirements.txt       ← daftar paket Python
├── render.yaml            ← pengaturan pemasangan online di Render
├── .python-version        ← versi Python yang dipakai Render
├── .env.example           ← contoh pengaturan (tanpa key)
└── .env                   ← pengaturan asli + key kamu (dibuat sendiri, rahasia)
```

### Catatan keamanan

- API key **hanya** ada di file `.env` di laptopmu. Server yang memakainya untuk menghubungi Gemini. Halaman web tidak pernah menerima key.
- `.env` sudah masuk `.gitignore`, jadi tidak akan ikut ter-upload kalau nanti proyek ini dimasukkan ke GitHub.
- Input dicek di server: bahan tidak boleh kosong dan maksimal 300 karakter, serta pilihan negara dan situasi harus dari daftar yang tersedia.
- Setiap pengguna dibatasi 5 permintaan resep per menit dan 50 per hari, 20 pertanyaan "berapa lama bahan ini tahan" per menit dan 200 per hari, serta 10 pertanyaan *swap* per menit dan 100 per hari (semuanya bisa diubah di `.env`). Jawaban lama simpan dan *swap* juga diingat server, jadi pertanyaan yang sama tidak dikirim dua kali ke Gemini.

### Untuk tahap berikutnya

- Negara baru cukup ditambahkan satu baris di `dishify/countries.py`.
