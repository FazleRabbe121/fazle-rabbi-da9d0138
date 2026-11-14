@echo off
setlocal enabledelayedexpansion
title CCD Hospitality - Android Release APK Builder

cd /d "%~dp0"
cls

echo ======================================================================
echo          CCD HOSPITALITY - ANDROID RELEASE APK BUILDER
echo ======================================================================
echo This script compiles the optimized web assets and builds the
echo production Android Release APK.
echo ======================================================================
echo.

rem 1. Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    if not exist "%ProgramFiles%\nodejs\node.exe" (
        echo [ERROR] Node.js is not found. Please install Node.js from https://nodejs.org/
        pause
        exit /b 1
    )
    set "PATH=%ProgramFiles%\nodejs;!PATH!"
)

rem 2. Check Java
set "JAVA_FOUND=0"
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" set "JAVA_FOUND=1"
if %JAVA_FOUND% equ 0 (
    where java >nul 2>&1 && set "JAVA_FOUND=1"
)
if %JAVA_FOUND% equ 0 (
    if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" (
        set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
        set "JAVA_FOUND=1"
    )
)
if %JAVA_FOUND% equ 0 (
    echo [ERROR] Java Development Kit (JDK 17) is not found.
    echo Please install JDK 17 or Android Studio.
    pause
    exit /b 1
)

echo [1/3] Compiling web production bundle (npm run build)...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Web build failed.
    pause
    exit /b 1
)

echo [2/3] Bundling web assets into Android project...
if not exist "android\app\src\main\assets\dist" mkdir "android\app\src\main\assets\dist" >nul 2>&1
xcopy /s /e /y /q /i "dist\*" "android\app\src\main\assets\dist\" >nul 2>&1

echo [3/3] Compiling Android Release APK via Gradle...
echo.
cd android
call gradlew.bat assembleRelease --no-daemon
set "BUILD_EXIT=!errorlevel!"
cd ..

if !BUILD_EXIT! neq 0 (
    echo.
    echo [ERROR] Gradle release build failed. Review logs above.
    pause
    exit /b 1
)

echo.
echo ======================================================================
echo                    RELEASE BUILD SUCCESSFUL!
echo ======================================================================
echo.
set "FOUND_RELEASE="
for %%F in ("android\app\build\outputs\apk\release\*.apk") do (
    set "FOUND_RELEASE=%%~fF"
    set "REL_NAME=%%~nxF"
)

if defined FOUND_RELEASE (
    echo Generated Release APK:
    echo   !FOUND_RELEASE!
    echo.
    echo File Name:
    echo   !REL_NAME!
    echo.
    echo You can transfer this APK to any Android phone or distribute it!
) else (
    echo Look for the release APK in:
    echo   android\app\build\outputs\apk\release\
)

echo ======================================================================
echo.
pause
