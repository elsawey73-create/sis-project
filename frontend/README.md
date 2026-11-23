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
