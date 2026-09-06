# Lannister Care — Post-Operative Recovery Platform

A full-stack platform connecting hospital administrators, doctors, and
patients around a post-operative recovery journey: SOS emergencies,
appointments, medicines, lab reports, diet safety checks, and a vitals
anomaly assessment — with an admin/doctor/patient login that never reveals
which role you're signing in as.

```
lannister-care/
├── backend/     Node.js + Express + Sequelize API (SQLite locally, Postgres in production)
└── frontend/    React + Vite + Tailwind CSS dashboard
```

## 1. Local setup

### Backend

```bash
cd backend
npm install
cp .env.example .env      # edit JWT_SECRET and admin credentials if you like
npm run seed               # creates the hidden admin account
npm run dev                 # http://localhost:5000
```

No database setup needed — a SQLite file is created automatically at
`backend/data/lannister_care.sqlite` the first time it runs.

The seed script prints the admin's email/password. Log in with those
credentials from the **same login page as everyone else** — there is
intentionally no "Admin" option anywhere in the UI.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env       # VITE_API_URL should point at your backend
npm run dev                  # http://localhost:5173
```

Open http://localhost:5173, log in as the admin, and you're off:
Admin → Manage Doctors → Add Doctor gives you a doctor login + a unique
doctor ID. Log in as that doctor, then use **Sign Up** on the login page as
a patient with that doctor's unique ID to see the full patient experience.

## 2. Enabling the AI features (optional)

Two features have safe, fully-functional fallbacks so the app works out of
the box with no API keys:

- **Kingslayer chatbot & Diet safety checker** — set `LLM_API_KEY` (and
  optionally `LLM_API_URL` / `LLM_MODEL`) in `backend/.env`. Written
  against the OpenAI-compatible chat completions schema, so it works with
  OpenAI, Grok, or any compatible provider by just changing the URL/model.
  Without a key, these fall back to clear rule-based responses.
- **Vitals anomaly detection (One-Class SVM)** — `backend/src/utils/anomalyEngine.js`
  currently uses a statistical stand-in tuned to normal post-op vitals
  ranges. See the comment at the top of that file for how to swap in a
  trained `sklearn.svm.OneClassSVM` behind a small microservice once you
  have labelled data — the rest of the app doesn't need to change.

## 3. Deploying

### Backend (Render, Railway, Fly.io, etc.)

1. Push this repo to GitHub.
2. Create a new Postgres database on your host (Render and Railway both
   offer one-click Postgres).
3. Create a new Web Service pointed at `backend/`, with:
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment variables: everything in `.env.example`, plus
     `DATABASE_URL` set to your Postgres connection string. The app
     automatically switches from SQLite to Postgres when `DATABASE_URL`
     is set — no code changes needed.
4. After the first deploy, run `npm run seed` once (via your host's shell/
   one-off job feature) to create the admin account against the new
   database.
5. Set `CORS_ORIGIN` to your deployed frontend's URL.

### Frontend (Vercel, Netlify, etc.)

1. Import `frontend/` as the project root.
2. Build command: `npm run build`, output directory: `dist`.
3. Environment variable: `VITE_API_URL` = your deployed backend URL
   (e.g. `https://lannister-care-api.onrender.com`).

### File uploads in production

Uploaded PDFs/JPGs/PNGs are currently stored on local disk
(`backend/uploads/`). Most PaaS hosts (Render, Railway, Fly.io) have an
**ephemeral filesystem**, meaning uploaded files can be lost on redeploy.
For a production deployment, either:
- attach a persistent volume/disk on your host, or
- swap `backend/src/middleware/upload.js` to upload to S3 / Cloudinary /
  another object store instead of `multer.diskStorage` (the rest of the
  app only cares about the returned URL, so this is a contained change).

## 4. Project conventions worth knowing

- **Roles** live on a single `users` table (`role: admin|doctor|patient`).
  The login endpoint is identical for every role — the frontend and
  backend never expose which kind of account just logged in.
- **Patient ↔ doctor mapping is temporary**, modeled as a `Surgery` row
  with `status: active|completed`. A patient signs up against exactly one
  doctor's unique ID per surgery; discharging a patient closes that row.
  A patient with no active surgery can sign up again later under a new
  doctor.
- **Doctor notes are private** — there is no patient-facing route that can
  ever read the `doctor_notes` table.
- **Chat threads are lightweight and ephemeral by design**: once a chat is
  closed, its messages remain in the database (for compliance/audit) but
  it drops out of the doctor's Priority Inbox.

## 5. Tech stack

- **Backend:** Node.js, Express, Sequelize (SQLite dev / Postgres prod),
  JWT auth, bcrypt, Multer, Socket.io (real-time chat), express-validator.
- **Frontend:** React 19, Vite, React Router, Tailwind CSS v4, Axios,
  Socket.io-client, Recharts (recovery trend chart).
