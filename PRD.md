# Product Requirements Document — EditFlow Auto Clipper

**Versi:** 1.0  
**Status:** Draft implementasi  
**Jenis:** Browser-only local-processing web application  
**Target awal:** Chrome dan Edge desktop  
**Bahasa awal:** Bahasa Indonesia

## 1. Ringkasan

EditFlow Auto Clipper membantu kreator mengubah satu video panjang menjadi beberapa video pendek vertikal. Pengguna memilih file dari laptop. Browser kemudian mentranskripsi audio, menemukan bagian yang menarik, mendeteksi wajah, menyusun crop dan posisi teks, serta menampilkan kandidat sebagai preview.

Kandidat belum menjadi MP4 final. Pengguna dapat memeriksa, mengubah waktu mulai dan selesai, mengganti layout, memperbaiki subtitle, serta memilih kandidat yang ingin dirender. Render final memakai CPU/GPU laptop pengguna.

## 2. Masalah

Clipping manual memerlukan proses berulang:

1. Menonton video panjang.
2. Mencatat timestamp.
3. Memotong bagian menarik.
4. Mengubah rasio ke 9:16.
5. Menjaga wajah tetap terlihat.
6. Membuat subtitle.
7. Memilih kata penting.
8. Menempatkan teks agar tidak menutupi wajah.
9. Render satu per satu.

## 3. Sasaran

### Sasaran utama

- Satu video dapat menghasilkan banyak kandidat.
- Video tidak keluar dari perangkat pengguna.
- Kandidat dapat dipreview sebelum render.
- Crop dan teks menyesuaikan posisi wajah.
- Pengguna dapat memperbaiki semua hasil otomatis.
- Beberapa kandidat dapat dirender melalui antrean.

### Bukan sasaran MVP

- Menjamin video viral.
- Downloader YouTube/TikTok atau platform lain.
- Penyimpanan cloud.
- Login, pembayaran, atau sistem kredit.
- Auto-posting.
- Mobile browser.
- Editor multitrack lengkap seperti aplikasi desktop profesional.

## 4. Target Pengguna

- Clipper pemula.
- Kreator podcast.
- Kreator edukasi.
- Personal brand.
- Pemilik usaha.
- Editor yang perlu mencari timestamp lebih cepat.

## 5. User Stories

- Sebagai pengguna, saya ingin memilih video lokal agar file tidak perlu diunggah.
- Saya ingin satu video menghasilkan 3, 5, 10, atau jumlah otomatis.
- Saya ingin kandidat muncul sebagai preview sebelum render.
- Saya ingin mengubah start/end agar kalimat tidak terpotong.
- Saya ingin wajah tetap berada dalam frame.
- Saya ingin teks otomatis diletakkan di ruang kosong.
- Saya ingin memperbaiki transcript dan keyword.
- Saya ingin merender hanya kandidat yang dipilih.
- Saya ingin menyimpan hasil ke laptop.
- Saya ingin membuka kembali project lokal.

## 6. Fitur MVP

### Import dan pemeriksaan

- Drag-and-drop atau file picker.
- Baca ukuran, durasi, resolusi, container, video codec, dan audio codec.
- Cek WebCodecs, WebGPU, Worker, OPFS, storage, dan output codec.
- Tampilkan status: Siap, Siap dengan fallback, atau Tidak didukung.

### Pengaturan

- Bahasa: otomatis, Indonesia, Inggris.
- Kandidat: otomatis, 3, 5, 10, semua yang lolos skor.
- Durasi: 15–30, 30–60, 60–90 detik, otomatis.
- Layout: Smart Editorial, Fokus Tengah, Background Blur, Subtitle Sederhana.
- Performa: Hemat, Seimbang, Maksimal.
- Output: 720×1280 atau 1080×1920.

### Analisis

- Ekstraksi audio lokal.
- Transkripsi dan timestamp.
- Deteksi jeda dan batas kalimat.
- Pembuatan kandidat.
- Scoring dan deduplication.
- Sampling frame.
- Deteksi wajah.
- Smart crop.
- Rekomendasi headline dan keyword.

### Kandidat

Setiap kandidat menampilkan:

- thumbnail;
- start/end;
- durasi;
- skor kualitas;
- alasan dipilih;
- layout yang disarankan;
- preview, edit, pilih, dan hapus.

### Editor

- Player 9:16.
- Timeline sederhana.
- Ubah start/end.
- Crop dan zoom manual.
- Pilih layout.
- Koreksi transcript.
- Atur pemenggalan subtitle.
- Ubah headline dan keyword.
- Safe-area overlay.
- Reset ke rekomendasi otomatis.

### Render

- Render satu clip.
- Render semua yang dipilih.
- Antrean serial secara default.
- Progress per tahap.
- Cancel dan retry.
- Simpan MP4 atau fallback yang kompatibel.

## 7. Aturan Kandidat

- Sistem tidak wajib memenuhi jumlah jika kualitas kurang.
- Awal dan akhir tidak boleh memotong kata penting.
- Kandidat harus dapat dipahami tanpa konteks panjang.
- Kandidat yang overlap tinggi harus dipilih salah satu atau digabung.
- Skor disebut **Skor Kualitas Kandidat**, bukan viral score.
- Pengguna dapat membuat kandidat manual.

## 8. Aturan Smart Editorial

- Deteksi posisi wajah.
- Lacak gerakan wajah.
- Haluskan pergerakan crop.
- Cari ruang kosong.
- Tempatkan headline 2–7 kata.
- Tempatkan keyword 1–4 kata.
- Jangan menutupi mata atau mulut.
- Jangan menempatkan elemen penting di area UI platform.
- Ganti layout pada batas kalimat, bukan setiap kata.
- Manual override selalu menang.

## 9. Nonfunctional Requirements

### Privasi

- Tidak ada video, audio, frame, thumbnail, transcript, atau nama file yang dikirim ke server.
- Analytics, jika kelak ada, harus opt-in dan anonim.
- Pengguna dapat menghapus semua data lokal.

### Performa

- Tugas berat berjalan di Worker.
- UI tetap responsif.
- File diproses bertahap.
- Frame, encoder, decoder, dan GPU resource harus dilepas.

### Ketahanan

- Kegagalan satu kandidat tidak merusak kandidat lain.
- Project dapat dilanjutkan setelah reload jika data tersedia.
- Error harus menyebut tahap, penyebab, dan solusi.

### Keamanan

- HTTPS.
- Dependency dan model dipin versinya.
- Input file dianggap tidak tepercaya.
- Tidak ada secret di frontend.

## 10. Metrik

- Persentase analisis berhasil.
- Waktu sampai preview pertama.
- Rata-rata kandidat yang dipilih.
- Koreksi start/end.
- Koreksi transcript.
- Persentase render berhasil.
- Audio/video sync.
- Persentase wajah tetap terlihat.
- Persentase teks tanpa collision.

## 11. Definition of Done

MVP selesai ketika pengguna dapat:

1. Membuka website lewat HTTPS.
2. Memilih file lokal.
3. Menjalankan compatibility check.
4. Mendapat transcript lokal.
5. Mendapat beberapa kandidat pada video uji.
6. Preview tanpa render final.
7. Mengubah start/end, crop, layout, dan teks.
8. Memilih beberapa kandidat.
9. Merender secara lokal.
10. Menyimpan output.
11. Menghapus project dan cache.
12. Menyelesaikan proses tanpa upload media.
