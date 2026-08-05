# EditFlow Auto Python Installer for Windows
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  EditFlow 1-Click Python & Engine Bootstrapper    " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# Check if Python is installed
$pythonExists = Get-Command python -ErrorAction SilentlyContinue

if ($pythonExists) {
    Write-Host "[✓] Python sudah terpasang di komputer Anda." -ForegroundColor Green
    python --version
} else {
    Write-Host "[!] Python belum terdeteksi. Memulai pengunduhan otomatis..." -ForegroundColor Yellow
    
    $pythonUrl = "https://www.python.org/ftp/python/3.11.8/python-3.11.8-amd64.exe"
    $installerPath = "$env:TEMP\python-3.11.8-installer.exe"

    Write-Host "[1/3] Mengunduh installer resmi Python 3.11..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $pythonUrl -OutFile $installerPath

    Write-Host "[2/3] Memasang Python secara otomatis (Silent Install)..." -ForegroundColor Cyan
    Start-Process -FilePath $installerPath -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_test=0" -Wait

    Write-Host "[3/3] Memperbarui PATH lingkungan Windows..." -ForegroundColor Cyan
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    Write-Host "[✓] Instalasi Python berhasil diselesaikan!" -ForegroundColor Green
}
