@echo off
title ReTech Shop
cd /d "%~dp0"
echo Dang kiem tra thu vien, vui long doi...
call npm install --no-audit --no-fund
REM === Thong tin chuyen khoan (bo chu REM o dau dong va sua lai cho dung) ===
REM set "BANK_ID=MB"
REM set "BANK_ACCOUNT=0123456789"
REM set "BANK_HOLDER=NGUYEN VAN A"
REM === Tu dong xac nhan tien ve qua SePay (xem README) ===
REM set "SEPAY_API_KEY=chuoi-bi-mat-cua-ban"
REM === Gui email (don hang, quen mat khau). Gmail: dung "Mat khau ung dung" ===
REM set "SMTP_HOST=smtp.gmail.com"
REM set "SMTP_PORT=587"
REM set "SMTP_USER=ban@gmail.com"
REM set "SMTP_PASS=mat-khau-ung-dung"
REM set "SMTP_FROM=ReTech <ban@gmail.com>"
REM === Ten mien that khi dua len mang (dung trong email va SEO) ===
REM set "BASE_URL=https://tenmien-cua-ban.vn"
REM set "JWT_SECRET=chuoi-bat-ky-that-dai"
start "" http://localhost:3000
echo.
echo Website dang chay tai http://localhost:3000
echo Dong cua so nay de tat website.
echo.
call npm start
pause
