# TrustLine frontend

The frontend is a React + TypeScript + Vite single-page application for the TrustLine user flows.

| Area                                    | Source                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Routes                                  | `src/App.tsx`                                                                            |
| Passkey registration/login              | `src/pages/RegisterPage.tsx`, `src/pages/LoginPage.tsx`                                  |
| Authenticated dashboard/dispute receipt | `src/pages/DashboardPage.tsx`, `src/pages/DisputeDemoPage.tsx`                           |
| API and current-tab token helpers       | `src/lib/apiClient.ts`, `src/lib/auth.ts`                                                |
| Security demonstrations                 | `src/pages/AttackDemoPage.tsx`, `src/pages/PhishingCloneDemoPage.tsx`, `src/components/` |

Run locally:

```bash
npm install
npm run dev
```

Set `VITE_API_URL` in `.env` when the API is not at `http://localhost:4000`. `npm run build` runs the TypeScript build and Vite production build; `npm run lint` runs Oxlint.

The repository-level [README](../README.md) is the product and security documentation source of truth.

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
