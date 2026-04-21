@echo off
echo Installing x-canvas dependencies...
echo.

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: npm is not installed or not in PATH
    pause
    exit /b 1
)

REM Install dependencies
echo Running: npm install
npm install --legacy-peer-deps

if %errorlevel% neq 0 (
    echo.
    echo Error: npm install failed
    pause
    exit /b 1
)

echo.
echo Installation complete! Next steps:
echo.
echo 1. Copy .env.example to .env.local
echo    (Set your X.com API credentials)
echo.
echo 2. Run the development server:
echo    npm run dev
echo.
pause
