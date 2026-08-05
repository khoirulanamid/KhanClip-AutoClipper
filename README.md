# EditFlow Auto Clipper

Dokumentasi lengkap untuk membangun aplikasi web **browser-only** yang mengubah video panjang menjadi beberapa kandidat video pendek vertikal.

## Keputusan Utama

| Bagian | Keputusan |
|---|---|
| Bentuk produk | Website online statis |
| Pemrosesan | Lokal di laptop pengguna |
| Upload video ke server | Tidak ada |
| VPS pemrosesan | Tidak diperlukan |
| Target awal | Chrome dan Edge desktop |
| Input MVP | File video lokal |
| Hasil | Beberapa kandidat clip |
| Alur | Analisis → preview → edit → render |
| Template utama | Smart Editorial |
| Transkripsi | Model Whisper di browser |
| Deteksi wajah | Model vision di browser |
| Preview | Video asli + overlay |
| Render final | WebCodecs + media muxer |
| Penyimpanan | IndexedDB, OPFS, dan file lokal |

> Gunakan hanya video milik sendiri, video berlisensi, atau video yang sudah mendapat izin. Fitur pengunduh video dari platform pihak ketiga tidak termasuk dalam MVP.

## Alur Produk

```text
Buka website
→ pemeriksaan browser dan perangkat
→ pilih video dari laptop
→ atur jumlah kandidat, durasi, bahasa, dan layout
→ transkripsi lokal
→ pembuatan banyak kandidat
→ analisis wajah dan ruang kosong
→ preview kandidat
→ koreksi start/end, crop, subtitle, headline
→ pilih kandidat
→ render lokal
→ simpan MP4
```

## Dokumen

- [PRD.md](./PRD.md)
- [SCOPE_AND_REQUIREMENTS.md](./SCOPE_AND_REQUIREMENTS.md)
- [USER_FLOW.md](./USER_FLOW.md)
- [UI_UX_SPEC.md](./UI_UX_SPEC.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [TECH_STACK.md](./TECH_STACK.md)
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)
- [DATA_MODEL_AND_CONTRACTS.md](./DATA_MODEL_AND_CONTRACTS.md)
- [WORKER_AND_JOB_SYSTEM.md](./WORKER_AND_JOB_SYSTEM.md)
- [AI_TRANSCRIPTION_PIPELINE.md](./AI_TRANSCRIPTION_PIPELINE.md)
- [HIGHLIGHT_DETECTION.md](./HIGHLIGHT_DETECTION.md)
- [SMART_LAYOUT_ENGINE.md](./SMART_LAYOUT_ENGINE.md)
- [SUBTITLE_AND_KINETIC_TEXT.md](./SUBTITLE_AND_KINETIC_TEXT.md)
- [PREVIEW_AND_RENDER_PIPELINE.md](./PREVIEW_AND_RENDER_PIPELINE.md)
- [PERFORMANCE_PRIVACY_BROWSER.md](./PERFORMANCE_PRIVACY_BROWSER.md)
- [TEST_AND_ACCEPTANCE.md](./TEST_AND_ACCEPTANCE.md)
- [ROADMAP_AND_DEVELOPMENT.md](./ROADMAP_AND_DEVELOPMENT.md)
- [AGENTS.md](./AGENTS.md)
- [TODO.md](./TODO.md)
- [TECHNICAL_REFERENCES.md](./TECHNICAL_REFERENCES.md)
