# AGENTS.md — EditFlow Auto Clipper

## Mission

Bangun EditFlow sebagai static web app yang memproses video secara lokal. Jangan mengubahnya menjadi backend/VPS tanpa keputusan eksplisit.

## Nonnegotiable Rules

1. Jangan mengunggah video, audio, frame, thumbnail, transcript, atau metadata sensitif.
2. Jangan menambahkan downloader pihak ketiga.
3. Jangan menjadikan API berbayar sebagai syarat MVP.
4. Jangan menjalankan tugas berat di main thread.
5. Jangan menyimpan media besar di React state.
6. Tutup frame, audio data, decoder, encoder, dan GPU resource.
7. Gunakan capability check sebelum codec.
8. Jangan menyebut score sebagai jaminan viral.
9. Preview sebelum render menjadi default.
10. Render hanya kandidat terpilih.
11. Manual override selalu menang.
12. Dependency baru harus diperiksa lisensi dan network behavior.

## Before Coding

- Baca PRD dan Architecture.
- Cari implementasi yang sudah ada.
- Jelaskan file yang akan diubah.
- Identifikasi risiko memory, worker, dan privacy.
- Hindari membuat kode duplikat.

## Architecture Rules

- UI → application → domain.
- Infrastructure mengimplementasikan adapter/provider.
- Domain tidak mengimpor React atau DOM.
- Worker protocol bertipe.
- Media dan AI tidak diakses langsung dari UI.
- Tidak membuat circular dependency.
- Tidak membuat satu file besar.

## Coding Standards

- TypeScript strict.
- Gunakan Result/AppError.
- Async menerima AbortSignal.
- Progress memakai event/callback.
- Waktu internal microseconds.
- Geometry normalized.
- Public function bertipe lengkap.
- Algoritma memiliki unit test.

## Media Safety Checklist

- [ ] frame ditutup;
- [ ] decoder/encoder ditutup;
- [ ] backpressure;
- [ ] cancel cleanup;
- [ ] temp dibersihkan;
- [ ] tidak ada full-file buffer tanpa alasan;
- [ ] codec fallback jelas;
- [ ] timestamp audio di-rebase;
- [ ] output divalidasi.

## UI Rules

- Tampilkan tahap nyata.
- Error memberi solusi.
- Opsi unsupported tidak tampak dapat dipakai.
- Hindari desain monoton atau template AI generik.
- Video preview menjadi fokus.
- Safe area dapat ditampilkan.
- Keyboard access wajib.

## Response Format untuk Coding Agent

Sebelum perubahan:

1. Tujuan.
2. File.
3. Risiko.
4. Rencana test.

Setelah perubahan:

1. Ringkasan.
2. File berubah.
3. Cara menjalankan.
4. Test yang benar-benar dijalankan.
5. Batasan tersisa.
