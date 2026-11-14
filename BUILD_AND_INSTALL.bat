@echo off
setlocal enabledelayedexpansion
title CCD Hospitality - Android 1-Click Build ^& Install System

rem ======================================================================
rem CCD Hospitality & Habit Engine - 1-Click Android Build + Install System
rem Automatically builds the app, produces the APK, installs it to your
rem connected Android phone via USB, and launches it automatically!
rem ======================================================================

cd /d "%~dp0"
cls

echo ======================================================================
echo    CCD HOSPITALITY - AUTOMATIC ANDROID BUILD ^& INSTALL SYSTEM
echo ======================================================================
echo.

rem ----------------------------------------------------------------------
rem 1. DETECT NODE.JS ^& NPM
rem ----------------------------------------------------------------------
echo [1/6] Checking Node.js and npm environment...

set "NODE_CMD="
where node >nul 2>&1
if !errorlevel! equ 0 (
    set "NODE_CMD=node"
) else (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "NODE_CMD=%ProgramFiles%\nodejs\node.exe"
        set "PATH=%ProgramFiles%\nodejs;!PATH!"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "NODE_CMD=%ProgramFiles(x86)%\nodejs\node.exe"
        set "PATH=%ProgramFiles(x86)%\nodejs;!PATH!"
    )
)

if not defined NODE_CMD (
    echo.
    echo ======================================================================
    echo [ERROR] Node.js is not found on your system!
    echo ======================================================================
    echo Node.js is required to build the modern web interface.
    echo Please download and install Node.js (LTS version) from:
    echo   https://nodejs.org/
    echo After installing, double-click BUILD_AND_INSTALL.bat again.
    echo ======================================================================
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('"!NODE_CMD!" -v 2^>nul') do set "NODE_VERSION=%%v"
echo       - Node.js found: !NODE_VERSION! [OK]

rem ----------------------------------------------------------------------
rem 2. DETECT JAVA / JDK
rem ----------------------------------------------------------------------
echo [2/6] Checking Java Development Kit (JDK 17+)...

set "JAVA_CMD="
if defined JAVA_HOME (
    if exist "%JAVA_HOME%\bin\java.exe" (
        set "JAVA_CMD=%JAVA_HOME%\bin\java.exe"
    )
)

if not defined JAVA_CMD (
    where java >nul 2>&1
    if !errorlevel! equ 0 (
        set "JAVA_CMD=java"
    ) else (
        rem Check common Windows JDK locations (Android Studio bundled JBR, Eclipse Adoptium, Oracle)
        if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" (
            set "JAVA_CMD=%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe"
            set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
        ) else if exist "%LOCALAPPDATA%\Programs\Android Studio\jbr\bin\java.exe" (
            set "JAVA_CMD=%LOCALAPPDATA%\Programs\Android Studio\jbr\bin\java.exe"
            set "JAVA_HOME=%LOCALAPPDATA%\Programs\Android Studio\jbr"
        ) else (
            for /d %%D in ("%ProgramFiles%\Eclipse Adoptium\jdk-17*" "%ProgramFiles%\Java\jdk-17*" "%ProgramFiles%\Java\jdk-21*" "%ProgramFiles%\Microsoft\jdk-17*") do (
                if exist "%%D\bin\java.exe" (
                    set "JAVA_CMD=%%D\bin\java.exe"
                    set "JAVA_HOME=%%D"
                )
            )
        )
    )
)

if not defined JAVA_CMD (
    echo.
    echo ======================================================================
    echo [ERROR] Java Development Kit (JDK 17) is not found!
    echo ======================================================================
    echo Android builds require Java 17.
    echo Recommended fix:
    echo 1. If you have Android Studio installed, Java is already included!
    echo    Set JAVA_HOME to: C:\Program Files\Android\Android Studio\jbr
    echo 2. Or download free Eclipse Adoptium Temurin JDK 17:
    echo    https://adoptium.net/temurin/releases/?version=17
    echo ======================================================================
    echo.
    pause
    exit /b 1
)

echo       - Java found [OK]

rem ----------------------------------------------------------------------
rem 3. DETECT ANDROID SDK ^& ADB (Android Debug Bridge)
rem ----------------------------------------------------------------------
echo [3/6] Detecting Android SDK and ADB...

set "ADB_EXE="

rem 1. Check in PATH
where adb.exe >nul 2>&1
if !errorlevel! equ 0 (
    for /f "tokens=*" %%a in ('where adb.exe 2^>nul') do (
        if not defined ADB_EXE set "ADB_EXE=%%a"
    )
)

rem 2. Check ANDROID_HOME environment variable
if not defined ADB_EXE (
    if defined ANDROID_HOME (
        if exist "%ANDROID_HOME%\platform-tools\adb.exe" (
            set "ADB_EXE=%ANDROID_HOME%\platform-tools\adb.exe"
        )
    )
)

rem 3. Check ANDROID_SDK_ROOT environment variable
if not defined ADB_EXE (
    if defined ANDROID_SDK_ROOT (
        if exist "%ANDROID_SDK_ROOT%\platform-tools\adb.exe" (
            set "ADB_EXE=%ANDROID_SDK_ROOT%\platform-tools\adb.exe"
        )
    )
)

rem 4. Check standard Android Studio SDK install path (%LOCALAPPDATA%\Android\Sdk)
if not defined ADB_EXE (
    if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
        set "ADB_EXE=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
        if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
    )
)

rem 5. Check user profile SDK path
if not defined ADB_EXE (
    if exist "%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe" (
        set "ADB_EXE=%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe"
        if not defined ANDROID_HOME set "ANDROID_HOME=%USERPROFILE%\AppData\Local\Android\Sdk"
    )
)

rem 6. Check common Program Files Android SDK
if not defined ADB_EXE (
    if exist "%ProgramFiles%\Android\Android Studio\platform-tools\adb.exe" (
        set "ADB_EXE=%ProgramFiles%\Android\Android Studio\platform-tools\adb.exe"
    )
)

if not defined ADB_EXE (
    echo.
    echo ======================================================================
    echo [ERROR] ADB (Android Debug Bridge) was not found!
    echo ======================================================================
    echo Please install Android SDK Platform Tools or configure Android SDK.
    echo.
    echo Option A (If Android Studio is installed):
    echo   Open Android Studio -^> Tools -^> SDK Manager -^> SDK Tools
    echo   Check "Android SDK Platform-Tools" and click Apply.
    echo.
    echo Option B (Standalone Platform-Tools - 2 minutes):
    echo   1. Download: https://developer.android.com/tools/releases/platform-tools
    echo   2. Extract to: C:\platform-tools
    echo   3. Add C:\platform-tools to your Windows PATH environment variable.
    echo ======================================================================
    echo.
    pause
    exit /b 1
)

rem Ensure ANDROID_HOME is set if not already defined
if not defined ANDROID_HOME (
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
    )
)

echo       - ADB found: "!ADB_EXE!" [OK]

rem ----------------------------------------------------------------------
rem 4. DETECT CONNECTED PHONE VIA USB ^& CHECK AUTHORIZATION
rem ----------------------------------------------------------------------
echo [4/6] Checking connected Android phone via USB...

rem Start ADB server silently
"!ADB_EXE!" start-server >nul 2>&1

:check_device_loop
set "DEVICE_FOUND=0"
set "DEVICE_AUTHORIZED=0"
set "DEVICE_ID="
set "DEVICE_STATUS="

for /f "skip=1 tokens=1,2" %%A in ('"!ADB_EXE!" devices 2^>nul') do (
    if not "%%A"=="" if not "%%B"=="" (
        set "DEVICE_FOUND=1"
        set "DEVICE_ID=%%A"
        set "DEVICE_STATUS=%%B"
        if "%%B"=="device" (
            set "DEVICE_AUTHORIZED=1"
            goto device_checked
        )
    )
)

:device_checked
if !DEVICE_FOUND! equ 0 (
    echo.
    echo ----------------------------------------------------------------------
    echo [WARNING] No Android phone detected!
    echo ----------------------------------------------------------------------
    echo Please:
    echo 1. Connect your Android phone to this laptop using a USB cable.
    echo 2. Unlock your phone screen.
    echo 3. Make sure USB Debugging is turned ON.
    echo.
    echo First-time phone setup (only once):
    echo   - Go to Settings -^> About Phone -^> Tap 'Build Number' 7 times.
    echo   - Open Developer Options -^> Enable 'USB Debugging'.
    echo ----------------------------------------------------------------------
    echo.
    set /p "RETRY_INPUT=Press ENTER to re-check after connecting phone, or Q to exit: "
    if /i "!RETRY_INPUT!"=="q" exit /b 1
    echo Re-checking connection...
    goto check_device_loop
)

if !DEVICE_AUTHORIZED! equ 0 (
    echo.
    echo ----------------------------------------------------------------------
    echo [ACTION REQUIRED] USB Debugging authorization is required!
    echo ----------------------------------------------------------------------
    echo Device detected: !DEVICE_ID! (Status: !DEVICE_STATUS!)
    echo.
    echo Please check your phone screen now and:
    echo   1. Check the box "Always allow from this computer"
    echo   2. Tap "Allow" on the USB Debugging popup!
    echo ----------------------------------------------------------------------
    echo.
    echo Waiting up to 15 seconds for authorization...
    
    set "AUTH_ATTEMPTS=0"
    :auth_wait_loop
    timeout /t 2 /nobreak >nul 2>&1
    set /a "AUTH_ATTEMPTS+=1"
    
    for /f "skip=1 tokens=1,2" %%A in ('"!ADB_EXE!" devices 2^>nul') do (
        if "%%A"=="!DEVICE_ID!" if "%%B"=="device" (
            set "DEVICE_AUTHORIZED=1"
            goto auth_success
        )
    )
    if !AUTH_ATTEMPTS! lss 8 goto auth_wait_loop

    echo.
    set /p "RETRY_AUTH=Still waiting for authorization. Tap 'Allow' on your phone and press ENTER to retry (or Q to quit): "
    if /i "!RETRY_AUTH!"=="q" exit /b 1
    goto check_device_loop
)

:auth_success
rem Fetch device model and manufacturer
set "DEVICE_NAME="
set "DEVICE_MODEL="
set "DEVICE_MFG="

for /f "tokens=*" %%m in ('"!ADB_EXE!" -s !DEVICE_ID! shell getprop ro.product.model 2^>nul') do set "DEVICE_MODEL=%%m"
for /f "tokens=*" %%m in ('"!ADB_EXE!" -s !DEVICE_ID! shell getprop ro.product.manufacturer 2^>nul') do set "DEVICE_MFG=%%m"

if defined DEVICE_MODEL (
    set "DEVICE_NAME=!DEVICE_MFG! !DEVICE_MODEL!"
) else (
    set "DEVICE_NAME=!DEVICE_ID!"
)

echo.
echo ----------------------------------------
echo Android Device Detected
echo ----------------------------------------
echo Device: !DEVICE_NAME!
echo Status: Connected [OK]
echo ----------------------------------------
echo.

rem ----------------------------------------------------------------------
rem 5. BUILD APPLICATION (WEB ASSETS + GRADLE ANDROID APK)
rem ----------------------------------------------------------------------
echo [5/6] Building application for Android...
echo.

rem Check node_modules
if not exist "node_modules\" (
    echo       - Installing required npm packages...
    call npm install
    if !errorlevel! neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

rem Build web assets (dist)
echo       - Compiling web interface (npm run build)...
call npm run build
if !errorlevel! neq 0 (
    echo.
    echo ======================================================================
    echo [ERROR] Web interface build failed!
    echo ======================================================================
    pause
    exit /b 1
)

rem Bundle web assets directly into Android assets
echo       - Bundling web assets into Android project...
if not exist "android\app\src\main\assets\dist" (
    mkdir "android\app\src\main\assets\dist" >nul 2>&1
)
xcopy /s /e /y /q /i "dist\*" "android\app\src\main\assets\dist\" >nul 2>&1
if !errorlevel! neq 0 (
    rem Fallback copy
    robocopy "dist" "android\app\src\main\assets\dist" /E /NFL /NDL /NJH /NJS /nc /ns /np >nul 2>&1
)
echo       - Web assets synchronized successfully [OK]

rem Build Android Debug APK with Gradle Wrapper
echo       - Building native Android APK via Gradle...
echo.
cd android
if not exist "gradlew.bat" (
    echo [ERROR] gradlew.bat not found in android/ directory!
    cd ..
    pause
    exit /b 1
)

call gradlew.bat assembleDebug --no-daemon
set "BUILD_EXIT_CODE=!errorlevel!"
cd ..

if !BUILD_EXIT_CODE! neq 0 (
    echo.
    echo ======================================================================
    echo [ERROR] Application build failed!
    echo ======================================================================
    echo Gradle build failed with exit code !BUILD_EXIT_CODE!.
    echo Please review the build error messages above.
    echo ======================================================================
    echo.
    pause
    exit /b 1
)

rem ----------------------------------------------------------------------
rem 6. LOCATE GENERATED APK, INSTALL VIA ADB ^& LAUNCH
rem ----------------------------------------------------------------------
echo.
echo [6/6] Locating APK, installing and launching on phone...

set "TARGET_APK=android\app\build\outputs\apk\debug\app-debug.apk"

if not exist "!TARGET_APK!" (
    rem Search for any .apk in debug directory
    for %%F in ("android\app\build\outputs\apk\debug\*.apk") do (
        set "TARGET_APK=%%F"
    )
)

if not exist "!TARGET_APK!" (
    echo.
    echo ======================================================================
    echo [ERROR] Build completed but the APK could not be located!
    echo ======================================================================
    echo Expected path: android\app\build\outputs\apk\debug\app-debug.apk
    echo ======================================================================
    echo.
    pause
    exit /b 1
)

for %%A in ("!TARGET_APK!") do set "APK_FILENAME=%%~nxA"
echo       - Found APK: !APK_FILENAME! [OK]

rem Install on the connected phone with -r (reinstall keeping user data) and -d (allow downgrade if needed)
echo       - Installing APK onto !DEVICE_NAME!...
"!ADB_EXE!" -s !DEVICE_ID! install -r -d "!TARGET_APK!"
if !errorlevel! neq 0 (
    echo.
    echo ======================================================================
    echo [ERROR] APK installation failed!
    echo ======================================================================
    echo ADB installation encountered an error.
    echo Make sure your phone screen is unlocked and storage is not full.
    echo ======================================================================
    echo.
    pause
    exit /b 1
)

echo       - APK installed successfully [OK]

rem Launch the application automatically
rem Package name for debug build is com.ccd.abetteryou.debug
set "APP_PACKAGE=com.ccd.abetteryou.debug"
set "APP_ACTIVITY=com.ccd.abetteryou.MainActivity"

echo       - Launching application on your phone...
"!ADB_EXE!" -s !DEVICE_ID! shell am start -n !APP_PACKAGE!/!APP_ACTIVITY! >nul 2>&1
if !errorlevel! neq 0 (
    rem Fallback launch via launcher category
    "!ADB_EXE!" -s !DEVICE_ID! shell monkey -p !APP_PACKAGE! -c android.intent.category.LAUNCHER 1 >nul 2>&1
)

rem ======================================================================
rem SUCCESS DISPLAY
rem ======================================================================
echo.
echo ========================================
echo BUILD ^& INSTALL SUCCESSFUL [OK]
echo ========================================
echo.
echo Device:
echo %DEVICE_NAME%
echo.
echo Application:
echo A Better You - CCD Hospitality ^& Habit Engine
echo.
echo Package:
echo %APP_PACKAGE%
echo.
echo APK:
echo %APK_FILENAME%
echo.
echo Status:
echo Installed successfully [OK]
echo.
echo Application launched successfully [OK]
echo.
echo ========================================
echo You can now use the application on your phone.
echo ========================================
echo.
pause
