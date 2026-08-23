# Skladdo Frontend

The React + Vite single-page app for Skladdo — the wholesale/distribution platform whose REST API lives in
the **`skladdo-backend`** repository. It serves both the public marketing site (landing, signup, password
flows) and the authenticated product: catalogue, inventory, orders, invoices, tenders, supplier email,
analytics, settings and administration.

## Features

- **Public + product in one app.** `/` is the landing page (features, free warehouse account, comparison,
  pricing, FAQ), `/register` is a step wizard whose steps depend on the account type, and everything else
  sits behind `ProtectedLayout`.
- **Permission-aware UI.** `AuthContext.can()` mirrors the backend's per-module view/create/edit/delete
  grants, so navigation and actions disappear for users who would be refused anyway. `RequirePermission`
  and `RequireAdmin` guard the routes.
- **Two account types.** A BUSINESS account gets the full app. A WAREHOUSE (3PL) account gets a trimmed
  shell plus a `CompanySwitcher`: it works *inside* its client companies, and switching company is an
  ordinary SPA navigation.
- **Three languages.** English, Estonian and Russian via i18next, detected from the browser and persisted
  in `localStorage` under `lang`. `src/i18n/locales/{en,et,ru}.js` are hand-edited and kept in parity by a
  test (see below).
- **Light and dark themes** (`ThemeContext`), toast notifications, a notification bell, and a dashboard of
  draggable widgets.
- **Server-side tables.** `useServerTable` + `DataTable` give paging, sorting, filtering and column
  visibility, with the state synced to the URL.
- **Import / export.** Client-side CSV and Excel (lazy-loaded ExcelJS) per entity, matching column headers
  in all three languages.
- Tailwind CSS v4 via `@tailwindcss/vite`, icons from `lucide-react`.

## Tech Stack

React 19 · React Router 7 · Vite 8 · Tailwind CSS 4 · i18next / react-i18next · ExcelJS · lucide-react ·
Vitest + Testing Library · Playwright · ESLint 10

## Project Structure

```text
src/
├── main.jsx          # entry: providers + router
├── App.jsx           # route table, public + protected
├── api/client.js     # fetch wrapper: base URL, JWT header, error translation
├── components/       # shared UI (DataTable, Modal, Sidebar, Header, modals, charts…)
├── config/plans.js   # plan ids, prices and caps shared by landing + register
├── constants/        # permission modules, audit actions, notification types, units
├── context/          # Auth, Settings, Theme, Toast
├── data/countries.js
├── hooks/            # useServerTable, useModal, useQuickCreate, dashboard layout…
├── i18n/             # i18next setup + locales/{en,et,ru}.js
├── pages/            # one file per route
└── utils/            # formatting, CSV/spreadsheet, stock, period helpers
```

## Getting Started

### Prerequisites

- Node.js ≥ 20 (CI uses 24)
- The backend running on `http://localhost:8080`

### Install and run

```bash
npm install
```

```bash
npm run dev
```

Vite prints the URL (usually `http://localhost:5173`).

### Connecting to the backend

`src/api/client.js` reads `VITE_API_BASE_URL`, falling back to `http://localhost:8080/api`. Copy
`.env.example` to `.env` to point it somewhere else:

```env
VITE_API_BASE_URL=http://localhost:8080/api
```

### Demo login

`owner@demo.com` / `owner123` for the seeded business account, `owner@balticlogistics.ee` /
`logistics123` for the warehouse partner. See the backend README for the rest.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright (needs both servers running) |

## Testing

**Vitest** covers pure logic (spreadsheet import/export, formatting) and a few components (`DataTable`,
`Modal`, `ImportModal`, `NotificationBell`). The default environment is `node`; a component test opts into
a DOM with a `// @vitest-environment jsdom` docblock rather than making every test pay for one.

`src/i18n/locales.test.js` is the one to know about: three hand-edited translation files fail *silently*
when they drift, so it enforces key parity in both directions, matching `{{placeholder}}` sets, complete
Russian plural forms (`_one/_few/_many`) and no empty or `TODO` strings. **Adding a key to `en.js` and not
the other two is a test failure, not a runtime fallback.**

**Playwright** (`e2e/`) drives the real app against a running backend: focus trapping, sorting, table URL
sync, theme switching, import cancellation and a general UI sweep.

CI (`.github/workflows/ci.yml`) runs build + unit tests in one job, and in a second job checks out
`skladdo-backend`, boots both servers and runs the Playwright suite.

## Conventions

- **Every user-facing string is a translation key**, added to all three locales in the same change.
- **New page** = a file in `src/pages`, a route in `App.jsx` wrapped in `RequirePermission` (or
  `RequireAdmin`), a sidebar entry, and locale keys.
- **Talk to the API through `src/api/client.js`** — it attaches the token and turns backend error keys
  into translated messages.
- Prefer the existing shared components (`DataTable`, `Modal`, `FormField`, `PageHeader`, `ActionMenu`)
  over new one-off layout code.
- Both themes are first-class: any new surface needs its `dark:` classes.

## Known gaps

- `npm run lint` currently reports pre-existing errors, mostly `react-hooks/set-state-in-effect` from the
  newer plugin version; lint is not part of CI yet.
- The card fields in the register wizard are a **preview only** — nothing is sent, charged or stored,
  because no payment provider is wired up on the backend.
