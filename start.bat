@echo off
setlocal
cd /d "%~dp0"
title Dishio

rem ------------------------------------------------------------------
rem  Klik dua kali file ini untuk menjalankan Dishio.
rem  Pertama kali: membuat folder .venv dan memasang paket Python
rem  Flask, python-dotenv, pytest. Berikutnya langsung jalan.
rem  Catatan: jangan pakai tanda kurung di teks echo file ini.
rem ------------------------------------------------------------------

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if defined PY goto :check_venv

echo.
echo  Python belum terpasang. Pasang dulu dari https://www.python.org/downloads/
echo  Centang "Add python.exe to PATH" saat memasang, lalu jalankan file ini lagi.
echo.
pause
exit /b 1

:check_venv
if exist ".venv\installed.ok" goto :check_env
echo.
echo  [1/2] Membuat lingkungan Python di folder .venv ...
%PY% -m venv .venv || goto :fail
echo  [2/2] Memasang paket: Flask, python-dotenv, pytest ...
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements.txt || goto :fail
echo ok> ".venv\installed.ok"

:check_env
if exist ".env" goto :run
copy ".env.example" ".env" >nul || goto :fail
echo.
echo  File .env baru dibuat. Notepad akan terbuka.
echo  Tempel key Gemini kamu tepat setelah GEMINI_API_KEY=
echo  lalu simpan dengan Ctrl+S dan tutup Notepad.
echo  Dishio akan menyala setelah Notepad ditutup.
echo.
start "" /wait notepad.exe ".env"

:run
".venv\Scripts\python.exe" app.py
echo.
pause
exit /b 0

:fail
echo.
echo  Ada yang gagal. Baca bagian "Kalau ada masalah" di README.md.
echo.
pause
exit /b 1
