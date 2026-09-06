# CasterlyCare Frontend

The CasterlyCare web application for post-operative recovery coordination across patients, doctors, and administrators.

## Development

```bash
npm install
npm run dev
```

The frontend expects the API at `VITE_API_URL`, defaulting to `http://localhost:5050`.

## Production build

```bash
npm run build
```

## Architecture

- `src/api/` — HTTP, socket, and feature service clients
- `src/components/` — shared application and UI components
- `src/config/` — routes and role navigation
- `src/context/` — authentication/session state
- `src/pages/` — role-specific application pages
