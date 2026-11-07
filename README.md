# RABPro Master - Kalkulator Rencana Anggaran Biaya (RAB) Bangunan

Aplikasi web modern berbasis **HTML, CSS, JavaScript (Vanilla), dan Node.js (Express)** untuk menghitung Rencana Anggaran Biaya (RAB) konstruksi, pembangunan gedung, dan renovasi rumah dengan standar acuan AHSP (Analisis Harga Satuan Pekerjaan) SNI Indonesia.

---

## 🌟 Fitur Utama

1. **Dashboard & Kalkulasi Real-time**:
   - Total Estimasi Biaya (Grand Total)
   - Biaya per meter persegi ($Rp / m^2$) & indikator kelas (Ekonomis, Menengah, Mewah)
   - Subtotal Biaya Riil (Bahan & Upah Tenaga Kerja)
   - Margin Jasa Kontraktor/Pemborong, Biaya Tak Terduga (Contingency), dan PPN
   - Konversi angka ke kalimat **Terbilang** otomatis dalam Bahasa Indonesia

2. **Tabel Rincian Pekerjaan Terstruktur**:
   - Dikelompokkan rapi per kategori pekerjaan (Persiapan, Pondasi, Struktur Beton, Dinding, Kusen, Atap & Plafon, Keramik, Sanitasi, Elektrikal, Finishing)
   - Pengeditan langsung volume dan harga satuan di dalam tabel (inline editing)
   - Fitur duplikasi baris dan penghapusan item dengan satu klik
   - Filter berdasarkan kategori dan kotak pencarian interaktif

3. **Database Katalog AHSP SNI Terpadu (40+ Item Standar)**:
   - Dilengkapi acuan harga material dan ongkos tukang standar Indonesia
   - Pemilih cepat (1-click picker) untuk memasukkan item katalog ke proyek aktif
   - Penambahan item baru ke database katalog

4. **Kalkulator Volume Bantu Dimensi Ruangan**:
   - **Hitung Dinding & Plesteran**: Panjang x tinggi otomatis dikurangi bukaan pintu & jendela
   - **Hitung Pondasi Batu Kali**: Profil penampang trapesium dan estimasi galian tanah
   - **Hitung Sloof & Kolom**: Panjang lari dan volume cor beton
   - **Hitung Lantai & Atap**: Luas lantai dan koreksi sudut kemiringan atap genteng
   - Tombol instan **"Terapkan ke RAB"** untuk langsung menyalurkan hasil hitungan volume ke tabel

5. **Estimator Cepat per $m^2$**:
   - Estimasi kasar untuk studi kelayakan (Rumah Sederhana, Menengah, Mewah, dan Ruko komersial) dengan pengali jumlah lantai

6. **Rekapitulasi Visual & Grafik Distribusi Biaya**:
   - Bar progress persentase biaya per kategori
   - Grafik Donut interaktif yang digambar menggunakan HTML5 Canvas

7. **Cetak Format Resmi A4 & Export Excel (CSV)**:
   - Format cetak rapi dengan kop dokumen RAB resmi, tabel rincian, terbilang, dan kolom tanda tangan Pemilik serta Kontraktor
   - Export file CSV siap buka di Microsoft Excel

8. **Tampilan Responsif & Mode Gelap/Terang**:
   - Menggunakan estetika modern dengan tema Gelap (Dark Mode) dan Terang (Light Mode)

---

## 🚀 Cara Menjalankan Aplikasi

Pastikan **Node.js** sudah terpasang di komputer Anda.

1. Buka terminal pada folder proyek:
   ```bash
   cd "d:/Coding 2/budi"
   ```

2. Jalankan server:
   ```bash
   npm start
   ```
   *Atau untuk mode pengembangan:*
   ```bash
   npm run dev
   ```

3. **Akses dari Komputer / Laptop**:
   Buka browser dan buka:
   ```
   http://localhost:3000
   ```

4. **📱 Akses Langsung dari HP / Smartphone (Android, iPhone, Tablet)**:
   - Hubungkan HP dan komputer ke **jaringan Wi-Fi / Hotspot yang sama**.
   - Buka browser di HP (Chrome / Safari) lalu ketik:
     ```
     http://192.168.1.7:3000
     ```
   - *Atau di komputer:* klik tombol **"📱 Buka di HP"** di pojok kanan atas aplikasi, lalu scan **QR Code** yang muncul menggunakan kamera HP Anda!

---

## 📱 Fitur Responsif Khusus Smartphone

- **Mode Kartu HP (Touch-Friendly Cards)**: Tabel RAB otomatis dapat dialihkan ke tampilan kartu vertikal yang nyaman dioperasikan dengan jempol tanpa perlu menggeser layar (*no horizontal scroll*).
- **Floating Bottom Bar**: Menampilkan Total RAB dan tombol simpan/tambah item yang menempel di bawah layar HP layaknya aplikasi native iOS/Android.
- **Swipeable Navigation Tabs**: Menu tab horizontal yang dapat digeser halus dengan sentuhan jari.
- **Font & Touch Size Optimal**: Input minimal 16px untuk mencegah masalah auto-zoom pada Safari iPhone.

## 📁 Struktur File Proyek

```
budi/
├── package.json               # Konfigurasi Node.js & dependencies
├── server.js                 # Backend Express & REST API
├── data/
│   ├── projects.json         # Penyimpanan data proyek & item RAB
│   └── ahsp_catalog.json     # Database katalog AHSP SNI Indonesia
├── public/
│   ├── index.html            # Antarmuka web semantik & modern
│   ├── css/
│   │   └── style.css         # Styling Vanilla CSS (Dark/Light + Print A4)
│   └── js/
│       └── app.js            # Logika kalkulasi, reaktifitas UI & chart
└── README.md
```
