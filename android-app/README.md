# AgroSyntra Android app (APK)

Wraps the demo build (`../build-demo`, built by `scripts/build-demo.sh`) in a Capacitor WebView.
The app runs fully on the phone with built-in demo data; no server is needed.

Built automatically by `.github/workflows/android-apk.yml` (Actions → "Android APK" → artifact `AgroSyntra-apk`).

Local build (needs JDK 17 and the Android SDK):

```bash
npm ci --legacy-peer-deps && bash scripts/build-demo.sh
cd android-app && npm install && npx cap add android && npm run sync
cd android && ./gradlew assembleDebug   # → app/build/outputs/apk/debug/app-debug.apk
```

## Signing

`keystore/debug.keystore` (alias `androiddebugkey`, password `android`) is a fixed **debug** key so every
build has the same signature and updates install over the previous version. It is not a secret.
For Google Play, create a private release key and keep it in repository secrets instead.
