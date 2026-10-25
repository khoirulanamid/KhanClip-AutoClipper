# 🎬 KHAN CLIP — AI-Powered Video Auto-Clipper

Aplikasi web modern berbasis AI untuk memotong video lanskap (16:9) menjadi video potret **9:16 (1080 × 1920)** vertikal otomatis untuk **TikTok, Instagram Reels, dan YouTube Shorts** dengan pelacakan wajah (*Face Tracking* MediaPipe) dan transkripsi subtitle otomatis.

---

## ✨ Fitur Unggulan

- 🎯 **AI Face Tracking Real-Time:** Menggunakan Google MediaPipe `FaceLandmarker` untuk mendeteksi pembicara aktif dan mengarahkan fokus kamera 9:16 secara mulus (*smooth lerp interpolation*).
- ⚡ **Download YouTube Anti-Limit:** Mendukung input tautan video/Shorts YouTube langsung diunduh lewat koneksi laptop pengguna tanpa limit kuota dan anti-blokir bot.
- 💬 **Universal AI Subtitle:** Terhubung ke provider STT (Gemini, Groq Whisper, OpenAI Whisper, Deepgram, OpenRouter) dengan subtitle yang dibakar (*hardsub*) langsung di atas video.
- 🔒 **100% Client-Side & Privasi Aman:** Seluruh pemrosesan render video dan crop wajah berjalan lokal di perangkat Anda.

---

## 🚀 Cara Menjalankan di Semua Laptop (Windows / Mac / Linux)

### Cara 1: Jalankan Langsung di Laptop (Rekomendasi Terbaik)
Dengan menjalankan lokal di laptop Anda, download video YouTube menggunakan koneksi internet pribadi Anda sendiri sehingga **100% bebas blokir dan tanpa batas durasi**:

1. **Clone repositori:**
   ```bash
   git clone https://github.com/khoirulanamid/KhanClip-AutoClipper.git
   cd KhanClip-AutoClipper
   ```

2. **Jalankan aplikasi:**
   - **Linux / macOS:**
     ```bash
     python3 server.py
     ```
   - **Windows:**
     ```cmd
     python server.py
     ```
     *(atau cukup klik ganda file `server.py`)*

3. Browser akan otomatis terbuka di `http://127.0.0.1:38281`. Tempel link YouTube apa saja dan video langsung siap dipotong!

---

### Cara 2: Buka Langsung Lewat Browser (Online)
Jika ingin mencoba tanpa instalasi apa pun, kunjungi versi GitHub Pages:  
👉 **[https://khoirulanamid.github.io/KhanClip-AutoClipper/](https://khoirulanamid.github.io/KhanClip-AutoClipper/)**

*(Di versi web online, Anda juga bisa langsung drag-and-drop file video lokal MP4/WebM dari laptop Anda).*

---

## 🛠️ Tech Stack
- **Frontend:** React 18, TypeScript, Vite, Canvas 2D API, MediaRecorder API
- **AI Vision:** `@mediapipe/tasks-vision` (FaceLandmarker GPU/WASM)
- **Downloader:** `yt-dlp` (Python Local Companion)
- **Styling:** CSS Variables, Hardware-Native Obsidian Matte Dark Mode

---

## 📄 Lisensi
MIT License © 2026 [Khoirul Anam](https://github.com/khoirulanamid)
