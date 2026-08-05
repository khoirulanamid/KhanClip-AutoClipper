# SUBTITLE_FIX_SPEC.md

## 1. Tujuan

Dokumen ini digunakan untuk memperbaiki sistem subtitle pada **EditFlow Auto Clipper yang sudah selesai dibuat**.

Fokus pekerjaan hanya pada:

- transkripsi suara;
- timestamp kata;
- pembentukan subtitle;
- sinkronisasi subtitle dengan suara;
- sinkronisasi subtitle setelah video dipotong;
- preview subtitle;
- render subtitle final;
- koreksi subtitle oleh pengguna.

Jangan membangun ulang website, arsitektur, halaman, sistem kandidat clip, atau fitur lain yang sudah berjalan.

---

## 2. Instruksi Utama untuk Coding Agent

Sebelum menulis kode:

1. Periksa implementasi subtitle yang sudah ada.
2. Temukan alur data mulai dari video sumber sampai subtitle dirender.
3. Identifikasi penyebab subtitle belum sesuai.
4. Jangan mengganti library atau arsitektur sebelum mengetahui penyebabnya.
5. Jangan menghapus fitur yang sudah berfungsi.
6. Perbaiki secara bertahap dan uji setiap tahap.
7. Tunjukkan file yang diubah dan alasan perubahannya.
8. Jangan menyatakan masalah selesai sebelum preview dan render diuji.

---

## 3. Hasil yang Diharapkan

Sistem subtitle harus bekerja seperti ini:

```text
Video sumber
→ audio dibaca secara lokal
→ audio ditranskripsi satu kali
→ setiap kata memiliki timestamp video sumber
→ kandidat clip mengambil kata sesuai rentangnya
→ timestamp diubah menjadi waktu lokal clip
→ subtitle ditampilkan di preview
→ pengguna dapat mengoreksi
→ render final memakai timing yang sama
```

Tidak boleh:

```text
Setiap kandidat ditranskripsi ulang
```

Tidak boleh pula:

```text
Preview menggunakan timing A
Render menggunakan timing B
```

---

## 4. Tidak Memerlukan API Key

Subtitle MVP harus berjalan menggunakan model lokal di browser:

```text
Transformers.js
+ ONNX Runtime Web
+ Whisper multilingual
+ WebGPU
```

Fallback:

```text
WebAssembly / CPU
```

Ketentuan:

- Tidak meminta OpenAI API key.
- Tidak meminta Google API key.
- Tidak mengirim audio ke server.
- Tidak mengirim transcript ke server.
- Model boleh diunduh dan disimpan di cache browser.
- Jika WebGPU tidak tersedia, gunakan mode CPU/WASM.

---

## 5. Sumber Masalah yang Harus Diperiksa

### 5.1 Timestamp masih absolut

Contoh:

```text
Kata berada pada detik 125.4 di video sumber.
Clip dimulai pada detik 125.0.
```

Subtitle dalam clip harus muncul pada:

```text
125.4 - 125.0 = 0.4 detik
```

Jika renderer langsung memakai `125.4`, subtitle akan sangat terlambat atau tidak muncul.

Rumus wajib:

```ts
localStartUs = sourceStartUs - candidateStartUs;
localEndUs = sourceEndUs - candidateStartUs;
```

---

### 5.2 Timestamp dikurangi dua kali

Pastikan timestamp tidak sudah diubah menjadi waktu lokal lalu dikurangi lagi ketika preview atau render.

Data harus memiliki nama yang jelas:

```ts
sourceStartUs
sourceEndUs
localStartUs
localEndUs
```

Hindari nama ambigu seperti:

```ts
start
end
time
timestamp
```

---

### 5.3 Satuan waktu bercampur

Periksa apakah kode mencampur:

- detik;
- milidetik;
- mikrodetik;
- timestamp frame.

Gunakan microseconds sebagai satuan internal:

```ts
const SECOND_US = 1_000_000;
const MILLISECOND_US = 1_000;
```

Konversi hanya pada batas UI atau API browser.

```ts
const secondsToUs = (seconds: number): number =>
  Math.round(seconds * 1_000_000);

const usToSeconds = (microseconds: number): number =>
  microseconds / 1_000_000;
```

---

### 5.4 Preview memakai timer biasa

Jangan hanya menggunakan:

```ts
setInterval(...)
```

untuk menyinkronkan subtitle.

Gunakan urutan preferensi:

1. `requestVideoFrameCallback`;
2. waktu aktual dari `HTMLVideoElement.currentTime`;
3. `requestAnimationFrame` sebagai fallback.

Contoh:

```ts
function updateSubtitle(
  video: HTMLVideoElement,
  candidateStartUs: number
): void {
  const sourceTimeUs =
    Math.round(video.currentTime * 1_000_000);

  const localTimeUs =
    sourceTimeUs - candidateStartUs;

  renderSubtitleAt(localTimeUs);
}
```

Jika `<video>` memutar file sumber langsung, `video.currentTime` biasanya masih merupakan waktu sumber. Jangan menguranginya lagi jika player sudah memakai file clip hasil potong.

---

### 5.5 Preview dan render memakai logika berbeda

Buat satu fungsi timeline bersama:

```ts
export function getActiveSubtitleCue(
  localTimeUs: number,
  cues: SubtitleCue[]
): SubtitleCue | null {
  return (
    cues.find(
      (cue) =>
        localTimeUs >= cue.localStartUs &&
        localTimeUs < cue.localEndUs
    ) ?? null
  );
}
```

Fungsi yang sama wajib digunakan oleh:

- preview;
- thumbnail preview bila menampilkan teks;
- final renderer;
- export frame;
- subtitle editor playback.

---

### 5.6 Start clip berubah tetapi cue tidak dibuat ulang

Saat pengguna mengubah awal clip:

```text
candidateStartUs berubah
```

sistem harus menjalankan:

```text
filter kata sesuai rentang baru
→ rebase timestamp
→ bentuk cue kembali
→ update preview
```

Tidak perlu melakukan transkripsi ulang.

---

### 5.7 Audio chunk menghasilkan kata ganda

Jika ASR memakai overlap antar-chunk, kata pada ujung chunk dapat muncul dua kali.

Contoh:

```text
Chunk A: "ini adalah cara"
Chunk B: "cara paling mudah"
```

Hasil salah:

```text
ini adalah cara cara paling mudah
```

Tambahkan deduplikasi berdasarkan:

- kemiripan teks;
- overlap timestamp;
- confidence;
- urutan kata.

---

### 5.8 Subtitle terlalu cepat berganti

Jangan membuat satu cue untuk setiap kata kecuali mode active-word.

Mode subtitle biasa harus menggabungkan kata menjadi frasa:

- 2–7 kata;
- maksimal dua baris;
- berhenti pada punctuation atau jeda;
- tidak memisahkan istilah;
- tidak menyisakan satu kata pendek.

---

### 5.9 Subtitle terlalu lambat

Periksa:

- offset global tidak sengaja positif;
- timestamp ASR sudah memiliki delay;
- cue dimulai saat kata selesai;
- UI hanya diperbarui terlalu jarang;
- proses preview terhambat main thread.

Sediakan pengaturan:

```text
Offset subtitle global:
-500 ms sampai +500 ms
```

Default:

```text
0 ms
```

---

### 5.10 Subtitle benar di preview tetapi salah di render

Periksa:

- renderer memakai source time atau local time;
- frame timestamp memakai satuan yang sama;
- candidate start dikurangi sekali;
- audio dan video output sudah di-rebase ke nol;
- render frame rate tidak digunakan sebagai pengganti timestamp asli;
- variable frame rate ditangani berdasarkan timestamp.

---

## 6. Model Data yang Direkomendasikan

```ts
export type TimingPrecision =
  | "word-native"
  | "segment-derived"
  | "estimated";

export interface TranscriptWord {
  id: string;
  text: string;

  // Timestamp dalam video sumber.
  sourceStartUs: number;
  sourceEndUs: number;

  confidence?: number;
  timingPrecision: TimingPrecision;
}
```

```ts
export interface SubtitleWord {
  id: string;
  transcriptWordId: string;
  text: string;

  // Timestamp dalam video sumber.
  sourceStartUs: number;
  sourceEndUs: number;

  // Timestamp setelah dikurangi candidateStartUs.
  localStartUs: number;
  localEndUs: number;

  emphasis: "none" | "active" | "keyword";
}
```

```ts
export interface SubtitleCue {
  id: string;
  words: SubtitleWord[];
  text: string;

  sourceStartUs: number;
  sourceEndUs: number;

  localStartUs: number;
  localEndUs: number;

  lineBreakAfterWordIds: string[];
}
```

```ts
export interface SubtitleTrack {
  id: string;
  candidateId: string;
  transcriptId: string;

  candidateStartUs: number;
  candidateEndUs: number;

  mode:
    | "phrase"
    | "active-word"
    | "kinetic-editorial";

  globalOffsetUs: number;
  cues: SubtitleCue[];
}
```

---

## 7. Membuat Subtitle Kandidat

```ts
export function buildCandidateSubtitleTrack(
  words: TranscriptWord[],
  candidateStartUs: number,
  candidateEndUs: number
): SubtitleTrack {
  const selectedWords = words
    .filter(
      (word) =>
        word.sourceEndUs > candidateStartUs &&
        word.sourceStartUs < candidateEndUs
    )
    .map((word) => ({
      id: crypto.randomUUID(),
      transcriptWordId: word.id,
      text: word.text,
      sourceStartUs: word.sourceStartUs,
      sourceEndUs: word.sourceEndUs,
      localStartUs: Math.max(
        0,
        word.sourceStartUs - candidateStartUs
      ),
      localEndUs: Math.min(
        candidateEndUs - candidateStartUs,
        word.sourceEndUs - candidateStartUs
      ),
      emphasis: "none" as const,
    }));

  const cues = groupWordsIntoReadableCues(selectedWords);

  return {
    id: crypto.randomUUID(),
    candidateId: "",
    transcriptId: "",
    candidateStartUs,
    candidateEndUs,
    mode: "phrase",
    globalOffsetUs: 0,
    cues,
  };
}
```

Jangan menyalin kode ini secara buta. Sesuaikan dengan struktur proyek yang sudah ada.

---

## 8. Active Word

Untuk mode highlight kata:

```ts
export function getActiveWord(
  localTimeUs: number,
  cue: SubtitleCue
): SubtitleWord | null {
  return (
    cue.words.find(
      (word) =>
        localTimeUs >= word.localStartUs &&
        localTimeUs < word.localEndUs
    ) ?? null
  );
}
```

Jika timing precision adalah `estimated`, gunakan highlight per frasa agar tidak terlihat salah.

---

## 9. Koreksi Manual

Pengguna harus dapat memperbaiki:

- teks kata;
- teks cue;
- waktu mulai cue;
- waktu selesai cue;
- line break;
- posisi;
- keyword;
- global offset.

Jangan menimpa transcript asli.

Gunakan override:

```ts
export interface SubtitleCueOverride {
  cueId: string;
  text?: string;
  startOffsetUs?: number;
  endOffsetUs?: number;
  lineBreakAfterWordIds?: string[];
}
```

---

## 10. Urutan Implementasi Perbaikan

### Tahap 1 — Audit

Cari file yang menangani:

- transkripsi;
- timestamp;
- candidate start/end;
- subtitle cue;
- preview;
- renderer final.

Buat diagram alur aktual sebelum mengubah kode.

### Tahap 2 — Normalisasi waktu

- Pilih microseconds.
- Ubah nama field menjadi jelas.
- Tambahkan fungsi konversi.
- Tambahkan unit test.

### Tahap 3 — Rebase kandidat

- Filter kata.
- Kurangi candidate start.
- Rebuild cue.
- Update saat start/end berubah.

### Tahap 4 — Preview sync

- Gunakan waktu video aktual.
- Gunakan `requestVideoFrameCallback`.
- Gunakan fungsi cue bersama.
- Tambahkan global offset.

### Tahap 5 — Render sync

- Gunakan cue dan fungsi timeline yang sama.
- Rebase timestamp output ke nol.
- Uji audio/video sync.

### Tahap 6 — UX

- Tambahkan editor teks.
- Tambahkan offset.
- Tambahkan label timing precision.
- Tambahkan fallback phrase mode.

---

## 11. Pengujian Wajib

### Unit Test

- detik ke microseconds;
- microseconds ke detik;
- filter kata berdasarkan kandidat;
- rebase timestamp;
- start clip berubah;
- end clip berubah;
- cue grouping;
- global offset;
- cue override;
- active word;
- chunk deduplication.

### Integration Test

- video → transcript;
- transcript → kandidat;
- kandidat → subtitle;
- subtitle → preview;
- subtitle → render;
- preview dan render menghasilkan timing sama.

### Video Uji

Buat video pendek legal milik sendiri berisi:

```text
Satu
Dua
Tiga
Empat
Lima
```

Berikan jeda yang jelas.

Catat timestamp sebenarnya, lalu bandingkan dengan:

- hasil transcript;
- preview;
- render final.

Tambahkan video:

- bicara cepat;
- jeda panjang;
- musik latar;
- Bahasa Indonesia;
- campuran Indonesia–Inggris;
- start clip di tengah jeda;
- end clip dekat kata terakhir.

---

## 12. Acceptance Criteria

### SUB-001

Subtitle dapat dibuat tanpa API key.

### SUB-002

Video hanya ditranskripsi sekali.

### SUB-003

Satu transcript dapat digunakan oleh semua kandidat.

### SUB-004

Mengubah start/end tidak menjalankan transkripsi ulang.

### SUB-005

Subtitle mengikuti suara pada preview.

### SUB-006

Subtitle preview dan render memakai timing yang sama.

### SUB-007

Active-word hanya digunakan ketika word timestamp cukup akurat.

### SUB-008

Pengguna dapat mengoreksi teks dan timing.

### SUB-009

WebGPU gagal tidak menghentikan aplikasi; CPU/WASM tersedia.

### SUB-010

Audio dan transcript tidak dikirim ke jaringan.

### SUB-011

Tidak ada kata ganda akibat overlap chunk.

### SUB-012

Tidak ada subtitle yang tampil di luar durasi kandidat.

---

## 13. Definition of Done

Perbaikan subtitle dianggap selesai jika:

1. penyebab masalah sudah dijelaskan;
2. waktu internal sudah konsisten;
3. source time dan local time terpisah;
4. satu transcript dipakai semua kandidat;
5. perubahan titik clip otomatis memperbarui cue;
6. preview sinkron;
7. render sinkron;
8. pengguna dapat mengoreksi;
9. fallback CPU/WASM berjalan;
10. semua unit test lulus;
11. integration test lulus;
12. video uji manual lulus;
13. tidak ada perubahan yang merusak fitur selain subtitle.

---

## 14. Format Laporan dari Coding Agent

Setelah selesai, coding agent harus menjawab:

```text
Penyebab masalah:
- ...

File yang diubah:
- ...

Perbaikan:
- ...

Test yang dijalankan:
- ...

Hasil:
- ...

Batasan yang masih ada:
- ...
```

Jangan hanya menjawab “subtitle sudah diperbaiki” tanpa bukti pengujian.
