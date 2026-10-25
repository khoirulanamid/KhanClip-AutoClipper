# 🎬 KHAN CLIP — AI-Powered Video Auto-Clipper

Aplikasi web modern berbasis AI untuk memotong video lanskap (16:9) menjadi video potret **9:16 (1080 × 1920)** vertikal otomatis untuk **TikTok, Instagram Reels, dan YouTube Shorts** dengan pelacakan wajah (*Face Tracking* MediaPipe) dan transkripsi subtitle otomatis.

---

## ✨ Fitur Unggulan

- 🎯 **AI Face Tracking Real-Time:** Menggunakan Google MediaPipe `FaceLandmarker` untuk mendeteksi pembicara aktif dan mengarahkan fokus kamera 9:16 secara mulus (*smooth lerp interpolation*).
- 💬 **Subtitle Whisper Web (Bebas API Key):** Menggunakan model AI Whisper langsung di dalam browser (WASM/WebGPU) tanpa perlu API key, tanpa kuota, dan 100% gratis selamanya. Mendukung pula provider cloud (Groq Whisper, Gemini, OpenAI).
- 🔒 **100% Client-Side & Privasi Aman:** Seluruh pemrosesan render video, crop wajah, dan transkripsi subtitle berjalan lokal di browser perangkat Anda tanpa server perantara.

---

## 🚀 Cara Menggunakan (Online)

Kunjungi versi live di GitHub Pages:  
👉 **[https://khoirulanamid.github.io/KhanClip-AutoClipper/](https://khoirulanamid.github.io/KhanClip-AutoClipper/)**

1. Pilih atau seret file video (MP4 / WebM / MOV) ke kotak aplikasi.
2. Tentukan detik mulai dan durasi potongan klip (15, 30, atau 60 detik).
3. Klik **"Lihat preview"** untuk melihat hasil tracking wajah 9:16 secara langsung.
4. Klik **"Potong dan unduh"** untuk mengekspor klip vertikal berkualitas tinggi.

---

## 🛠️ Tech Stack
- **Frontend:** React 18, TypeScript, Vite, Canvas 2D API, MediaRecorder API
- **AI Vision:** `@mediapipe/tasks-vision` (FaceLandmarker GPU/WASM)
- **Styling:** CSS Variables, Hardware-Native Obsidian Matte Dark Mode

---

## 📄 Lisensi
MIT License © 2026 [Khoirul Anam](https://github.com/khoirulanamid)
