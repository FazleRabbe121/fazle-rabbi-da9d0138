@echo off
setlocal enabledelayedexpansion
title CCD Hospitality - Android USB Connection Checker

cd /d "%~dp0"
cls

echo ======================================================================
echo             ANDROID PHONE USB CONNECTION CHECKER
echo ======================================================================
echo.

set "ADB_EXE="
where adb.exe >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%a in ('where adb.exe 2^>nul') do if not defined ADB_EXE set "ADB_EXE=%%a"
) else if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
    set "ADB_EXE=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
) else if exist "%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe" (
    set "ADB_EXE=%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe"
) else if defined ANDROID_HOME (
    if exist "%ANDROID_HOME%\platform-tools\adb.exe" set "ADB_EXE=%ANDROID_HOME%\platform-tools\adb.exe"
)

if not defined ADB_EXE (
    echo [ERROR] ADB is not found. Please run SETUP_ANDROID_ENVIRONMENT.bat first.
    echo.
    pause
    exit /b 1
)

"!ADB_EXE!" start-server >nul 2>&1

echo Scanning for connected Android devices...
echo.

set "FOUND=0"
for /f "skip=1 tokens=1,2" %%A in ('"!ADB_EXE!" devices 2^>nul') do (
    if not "%%A"=="" (
        set "FOUND=1"
        set "DEV_ID=%%A"
        set "DEV_STATUS=%%B"
        
        echo ----------------------------------------------------
        echo Device Serial: !DEV_ID!
        echo Status:        !DEV_STATUS!
        
        if "!DEV_STATUS!"=="device" (
            for /f "tokens=*" %%m in ('"!ADB_EXE!" -s !DEV_ID! shell getprop ro.product.manufacturer 2^>nul') do echo Manufacturer:  %%m
            for /f "tokens=*" %%m in ('"!ADB_EXE!" -s !DEV_ID! shell getprop ro.product.model 2^>nul') do echo Model:         %%m
            for /f "tokens=*" %%v in ('"!ADB_EXE!" -s !DEV_ID! shell getprop ro.build.version.release 2^>nul') do echo Android OS:    Version %%v
            for /f "tokens=*" %%b in ('"!ADB_EXE!" -s !DEV_ID! shell dumpsys battery 2^>nul ^| findstr "level"') do echo Battery:       %%b
            echo.
            echo [OK] THIS PHONE IS READY FOR 1-CLICK BUILD ^& INSTALL!
        ) else if "!DEV_STATUS!"=="unauthorized" (
            echo.
            echo [ACTION REQUIRED]
            echo Unlock your phone and look at the screen:
            echo Check "Always allow from this computer" and tap "Allow"!
        ) else (
            echo Status note: !DEV_STATUS! (Try reconnecting the USB cable)
        )
        echo ----------------------------------------------------
    )
)

if %FOUND% equ 0 (
    echo [WARNING] No Android phone detected over USB.
    echo.
    echo Check:
    echo 1. Is the USB cable securely connected between laptop and phone?
    echo 2. Is your phone unlocked?
    echo 3. Did you turn on "USB Debugging" in Settings -^> Developer Options?
    echo 4. Set USB connection mode on your phone to "File Transfer / MTP" instead of "Charging only".
)

echo.
pause
