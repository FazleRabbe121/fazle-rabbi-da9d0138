# CCD — A Better You Every Day & Automated Hospitality Job Engine

An executive-tier personal development, financial management, habit integrity, and automated hospitality career application system tailored for hospitality professionals.

---

## 🌟 Key Features

1. **Cyprus Job Market (Strict Isolation)**
   - Specifically dedicated to Cyprus hospitality openings across Limassol Marina, Paphos, Ayia Napa, Protaras, Larnaca, Nicosia, and Polis Chrysochous.
   - Target positions: Bartender, Barman, Barista, Mixologist, Hotel Bar, Restaurant Bar, Pool Bar, Lobby Bar, Café, and Beverage/Hospitality roles.

2. **Europe Job Market (Pan-European)**
   - Open search across top European hospitality markets (Cyprus, Greece, Malta, Italy, Spain, Portugal, France, Germany, Austria, Netherlands, Belgium, Ireland, Switzerland, Croatia, and more).

3. **10-Day Applied Job Hide System**
   - Automatically hides applied jobs from search results for 10 days to prevent duplicates.
   - Persistently stores Job ID, Company, Position, Job URL, Recipient Email, Application Date, Gmail Message ID, and Application Status.
   - Dedicated "10-Day Protected Vault" modal for tracking cooldowns.

4. **3-AI Verification Consensus (Gemini + OpenAI + Grok)**
   - Real-time search via Google Search Grounding.
   - Legitimacy verification, direct corporate HR email verification, and 3-month posting freshness checks.

5. **Gmail Direct Application Engine**
   - Sends individual, personalized emails directly from the user's connected Gmail account (no CC/BCC).
   - Automatically attaches candidate's CV (PDF from template or phone storage).
   - Full live bounce detection (`DELIVERY FAILED`) and incoming reply tracking.

6. **Native Android APK Packaging**
   - Packaged with an Android application wrapper in `/android`.
   - Embeds the web application assets for offline capability and rapid loading.
   - Supports native Android file picking for attaching CVs directly from phone storage.
   - Automated GitHub Actions workflow to build and download the Android APK artifact.

---

## ⚡ 1-Click Windows USB Build & Install System (Laptop + USB + Android Phone)

If you have a **Windows laptop**, an **Android phone**, and a **USB cable**, you can build, install, and open the app on your phone with a **single double-click** — without typing any commands!

### 🎯 Workflow Overview

```
ANDROID PHONE  ──(USB Cable)──>  WINDOWS LAPTOP
                                       ↓
                        Double-Click "BUILD_AND_INSTALL.bat"
                                       ↓
                        Application Builds Automatically
                                       ↓
                        APK Created Automatically
                                       ↓
                        APK Installed onto Connected Phone
                                       ↓
                        App Automatically Launches on Phone!
```

---

### 📱 First-Time Phone Setup (Only Do Once)

1. Open **Settings** on your Android phone.
2. Go to **About Phone**.
3. Tap **Build Number** 7 times continuously until you see *"You are now a developer!"*.
4. Go to **Settings → System → Developer Options** (or search "Developer options" in Settings).
5. Turn ON **USB Debugging**.
6. Connect your phone to your Windows laptop using the USB cable.
7. Unlock your phone. When Android shows the popup **"Allow USB debugging?"**:
   - Check the box: `[x] Always allow from this computer`
   - Tap **"Allow"**.

---

### 🚀 Every Time You Test or Update the App:

1. Connect your Android phone to your laptop with the USB cable.
2. In the project root folder, double-click:
   ```
   BUILD_AND_INSTALL.bat
   ```
3. That's it! The script will automatically:
   - Check your environment (Node.js, Java, Android SDK/ADB).
   - Detect your connected phone model.
   - Compile the web frontend (`dist`).
   - Bundle web assets directly into `android/app/src/main/assets/dist/`.
   - Build the Android APK via Gradle (`gradlew.bat assembleDebug`).
   - Reinstall/update the APK on your phone (`adb install -r`).
   - Automatically launch the application on your phone!

---

### 🛠️ Included Automation Utility Scripts

| Script Name | Purpose |
|-------------|---------|
| **`BUILD_AND_INSTALL.bat`** | **Primary 1-Click script:** Builds, installs to USB phone, and launches app. |
| **`SETUP_ANDROID_ENVIRONMENT.bat`** | Diagnostic tool that checks Node.js, Java 17, Android SDK & ADB readiness. |
| **`CHECK_ANDROID_DEVICE.bat`** | 2-second tool to check if phone is detected, authorized, and ready over USB. |
| **`BUILD_RELEASE.bat`** | Builds the standalone Android Release APK (`assembleRelease`). |

---

## 📱 Building the Android APK via GitHub Actions

This repository includes a pre-configured GitHub Actions workflow (`.github/workflows/build-android-apk.yml`) that automatically builds the Android APK.

### Step 1: Push Project to Your GitHub Repository

Initialize and push to your GitHub repository:

```bash
git add .
git commit -m "Complete project with Cyprus/Europe Job Markets and Android APK configuration"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPOSITORY_NAME>.git
git push -u origin main
```

### Step 2: Automatic APK Build on GitHub

1. Once pushed to GitHub, navigate to the **Actions** tab in your repository.
2. You will see the **Build Android APK** workflow running automatically.
3. You can also trigger it manually anytime by clicking **Run workflow** under **Actions** → **Build Android APK**.

### Step 3: Download and Install APK on Android Phone

1. In the **Actions** tab, click on the completed workflow run.
2. Scroll down to the **Artifacts** section at the bottom.
3. Click on **CCD-Hospitality-Android-App-Debug-APK** to download the ZIP file.
4. Unzip the file on your computer or phone to obtain `app-debug.apk`.
5. Transfer `app-debug.apk` to your Android phone (or download directly via browser on your phone).
6. Tap the APK file to install (allow "Install from Unknown Sources" if prompted by Android).

---

## 💻 Local Web & Backend Development

### Prerequisites

- Node.js 18+ or 20+
- npm

### Installation

```bash
npm install
```

### Run Dev Server (Vite + Express Backend)

```bash
npm run dev
```

The application runs on `http://localhost:3000`.

### Production Build

```bash
npm run build
npm start
```

---

## 🔒 Security & Environment Variables

Never commit private credentials or API keys directly to GitHub. Configure sensitive values in your repository's **Settings → Secrets and variables → Actions**:

- `GEMINI_API_KEY`: Google Gemini API key
- `OPENAI_API_KEY`: OpenAI API key
- `GROK_API_KEY`: xAI Grok API key

---

## 📂 Project Architecture

```
├── .github/workflows/       # GitHub Actions automated Android APK builder
│   └── build-android-apk.yml
├── android/                 # Android project source and Gradle configuration
│   ├── app/
│   │   ├── build.gradle.kts
│   │   ├── google-services.json
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── java/com/ccd/abetteryou/MainActivity.kt  # Full Android WebView host
│   │       └── assets/dist/                            # Bundled web application assets
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   ├── gradlew              # Executable Gradle wrapper
│   └── gradlew.bat
├── src/                     # React TypeScript frontend
│   ├── components/          # UI Components & AI Automated Job Engine
│   ├── services/            # Gmail, Firebase, Job Database & Cooldown Service
│   ├── types/               # Type definitions
│   └── views/               # Views (Job Engine, CV Manager, Finance, Habits)
├── server.ts                # Express backend with 3-AI search & verification pipeline
├── package.json
└── vite.config.ts
```
