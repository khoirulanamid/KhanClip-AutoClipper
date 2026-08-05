import os
import sys
import tempfile
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI(title="EditFlow Local Engine", version="1.0.0")

# Enable CORS for http://localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = os.path.join(tempfile.gettempdir(), "editflow_local_media")
os.makedirs(TEMP_DIR, exist_ok=True)

class URLRequest(BaseModel):
    url: str

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "EditFlow Python Local Engine",
        "port": 8000,
        "temp_dir": TEMP_DIR,
    }

@app.post("/process-url")
async def process_url(req: URLRequest):
    if not req.url:
        raise HTTPException(status_code=400, detail="URL tidak boleh kosong")

    output_filename = "downloaded_video.mp4"
    output_path = os.path.join(TEMP_DIR, output_filename)

    # Command yt-dlp to fetch media locally
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "-f", "b[ext=mp4]/b",
        "-o", output_path,
        "--no-playlist",
        "--force-overwrites",
        req.url
    ]

    try:
        proc = await asyncio.create_subprocess_exec(*cmd)
        await proc.communicate()

        if proc.returncode != 0 or not os.path.exists(output_path):
            raise Exception("Gagal mengunduh video dari URL. Pastikan URL valid dan diizinkan.")

        file_size = os.path.getsize(output_path)

        return {
            "success": True,
            "filename": output_filename,
            "stream_url": f"http://127.0.0.1:8000/stream/{output_filename}",
            "size_bytes": file_size,
            "message": "Video berhasil diambil oleh EditFlow Local Engine",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/stream/{filename}")
def stream_file(filename: str):
    file_path = os.path.join(TEMP_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    return FileResponse(file_path, media_type="video/mp4", filename=filename)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
