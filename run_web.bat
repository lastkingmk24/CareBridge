@echo off
rem Build and start the CareBridge web interface on Windows (MinGW-w64 / MSYS2).
rem   run_web.bat        -> http://localhost:8080
rem   run_web.bat 9090   -> another port
setlocal
cd /d "%~dp0"

if not exist carebridge_web.exe (
  echo Building the web server...
  g++ -std=c++17 -O2 -o carebridge_web.exe src\server.cpp src\CareBridge.cpp -lws2_32
  if errorlevel 1 (
    echo Build failed. Install MSYS2 / MinGW-w64 g++ and try again.
    exit /b 1
  )
)

echo.
echo CareBridge starting on the default port 8080 when no port is given
echo Open http://localhost:8080 in your browser.
echo Demo logins: patient P001 / pat123, doctor D001 / doc123
echo Press Ctrl+C to stop.
echo.

if "%~1"=="" (
  carebridge_web.exe
) else (
  carebridge_web.exe %1
)
