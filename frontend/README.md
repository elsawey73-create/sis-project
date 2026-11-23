# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Unidex production build

`npm run build` writes a static site to `dist`. Vite inlines `VITE_API_URL` at build time. Set it to the API origin plus `/api` (see `frontend/.env.example`).

PowerShell:

```text
$env:VITE_API_URL = "https://api.example.com/api"
npm run build
```

Serve `dist` from any static host. The API does not serve these files. A production bundle built without `VITE_API_URL` throws when the app loads. `npm run dev` does not need the variable: it calls `http://<page-hostname>:5000/api`.

Hosting steps for the API and the database are in `docs/deployment.md`.

## Android app

The native app is a Capacitor Android shell around this Vite build. App id `com.unidex.app`. The WebView origin is `https://localhost`, and client routes such as `/login` are served `index.html` (`server.html5mode` in `capacitor.config.json`), so React Router's `BrowserRouter` works without hash URLs.

Inside the native app the API base is the production backend (`https://sis-project-production-8d2536d4.up.railway.app/api`). The website build is unchanged: it still uses `VITE_API_URL`. Set `VITE_NATIVE_API_URL` only when the app should call a different API.

From `frontend`, with the Android SDK installed and `ANDROID_HOME` set:

```text
npm install
npm run build:android
cd android
./gradlew assembleDebug
```

`build:android` is `vite build` and `npx cap sync android`. The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`. Open the project in Android Studio with `npx cap open android` to run it on a device or emulator. `android/.gitignore` keeps Gradle outputs, `local.properties`, and the copied web assets out of git; run `build:android` again after pulling.
