@echo off
setlocal enabledelayedexpansion
title CCD Hospitality - Android Environment Diagnostic Checker

cd /d "%~dp0"
cls

echo ======================================================================
echo       ANDROID DEVELOPMENT ENVIRONMENT DIAGNOSTIC CHECKER
echo ======================================================================
echo This tool checks your Windows computer to see if all necessary
echo tools are installed to build and install the Android app.
echo It will NOT install anything or change settings without permission.
echo ======================================================================
echo.

set "ALL_OK=1"

rem ----------------------------------------------------------------------
rem 1. NODE.JS CHECK
rem ----------------------------------------------------------------------
echo [1/4] Checking Node.js and npm...
where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('node -v 2^>nul') do echo       - Node.js is installed: %%v [PASS]
) else (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        for /f "tokens=*" %%v in ('"%ProgramFiles%\nodejs\node.exe" -v 2^>nul') do echo       - Node.js found in Program Files: %%v [PASS]
    ) else (
        echo       - [MISSING] Node.js is not found.
        echo         Download from: https://nodejs.org/ (Download LTS version)
        set "ALL_OK=0"
    )
)

rem ----------------------------------------------------------------------
rem 2. JAVA / JDK CHECK
rem ----------------------------------------------------------------------
echo.
echo [2/4] Checking Java Development Kit (JDK 17+)...
set "JAVA_FOUND=0"

if defined JAVA_HOME (
    if exist "%JAVA_HOME%\bin\java.exe" (
        for /f "tokens=*" %%v in ('"%JAVA_HOME%\bin\java.exe" -version 2^>^&1') do (
            echo       - Java found via JAVA_HOME: %%v [PASS]
            set "JAVA_FOUND=1"
            goto java_done
        )
    )
)

where java >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('java -version 2^>^&1') do (
        echo       - Java found in PATH: %%v [PASS]
        set "JAVA_FOUND=1"
        goto java_done
    )
)

if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" (
    echo       - Java found in Android Studio bundled JBR [PASS]
    set "JAVA_FOUND=1"
    goto java_done
)

for /d %%D in ("%ProgramFiles%\Eclipse Adoptium\jdk-17*" "%ProgramFiles%\Java\jdk-17*" "%ProgramFiles%\Java\jdk-21*") do (
    if exist "%%D\bin\java.exe" (
        echo       - Java 17 found in %%D [PASS]
        set "JAVA_FOUND=1"
        goto java_done
    )
)

:java_done
if %JAVA_FOUND% equ 0 (
    echo       - [MISSING] Java Development Kit 17 is not found.
    echo         Download free Temurin JDK 17: https://adoptium.net/temurin/releases/?version=17
    set "ALL_OK=0"
)

rem ----------------------------------------------------------------------
rem 3. ANDROID SDK ^& ADB CHECK
rem ----------------------------------------------------------------------
echo.
echo [3/4] Checking Android SDK and ADB (Android Debug Bridge)...
set "ADB_FOUND=0"
set "DETECTED_ADB="

where adb.exe >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%a in ('where adb.exe 2^>nul') do (
        set "DETECTED_ADB=%%a"
        set "ADB_FOUND=1"
        goto adb_done
    )
)

if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
    set "DETECTED_ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
    set "ADB_FOUND=1"
    goto adb_done
)

if exist "%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe" (
    set "DETECTED_ADB=%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe"
    set "ADB_FOUND=1"
    goto adb_done
)

if defined ANDROID_HOME (
    if exist "%ANDROID_HOME%\platform-tools\adb.exe" (
        set "DETECTED_ADB=%ANDROID_HOME%\platform-tools\adb.exe"
        set "ADB_FOUND=1"
        goto adb_done
    )
)

:adb_done
if %ADB_FOUND% equ 1 (
    echo       - ADB found: "!DETECTED_ADB!" [PASS]
    for /f "tokens=*" %%v in ('"!DETECTED_ADB!" version 2^>nul') do echo         %%v
) else (
    echo       - [MISSING] ADB is not detected.
    echo         If you have Android Studio: Tools -^> SDK Manager -^> SDK Tools -^> install Android SDK Platform-Tools
    echo         Or download standalone Platform Tools: https://developer.android.com/tools/releases/platform-tools
    set "ALL_OK=0"
)

rem ----------------------------------------------------------------------
rem 4. CONNECTED ANDROID PHONE USB TEST
rem ----------------------------------------------------------------------
echo.
echo [4/4] Testing USB connection to Android phone...
if %ADB_FOUND% equ 1 (
    "!DETECTED_ADB!" start-server >nul 2>&1
    set "DEV_COUNT=0"
    for /f "skip=1 tokens=1,2" %%A in ('"!DETECTED_ADB!" devices 2^>nul') do (
        if not "%%A"=="" (
            set /a "DEV_COUNT+=1"
            echo       - Device found: %%A (Status: %%B)
            if "%%B"=="device" (
                echo         Device is authorized and ready for 1-click install! [PASS]
            ) else if "%%B"=="unauthorized" (
                echo         [ACTION NEEDED] Tap "Allow" on the USB Debugging popup on your phone!
            )
        )
    )
    if !DEV_COUNT! equ 0 (
        echo       - No phone detected via USB yet.
        echo         When you are ready: Connect phone via USB, unlock it, and enable USB Debugging.
    )
) else (
    echo       - (Skipped phone test because ADB is not yet configured)
)

rem ----------------------------------------------------------------------
rem SUMMARY
rem ----------------------------------------------------------------------
echo.
echo ======================================================================
if %ALL_OK% equ 1 (
    echo [RESULT] YOUR COMPUTER IS READY!
    echo All required development tools are present.
    echo You can now connect your phone and double-click:
    echo.
    echo   BUILD_AND_INSTALL.bat
) else (
    echo [RESULT] SOME TOOLS ARE STILL NEEDED.
    echo Please install the missing tools listed above, then run this check again.
)
echo ======================================================================
echo.
pause
