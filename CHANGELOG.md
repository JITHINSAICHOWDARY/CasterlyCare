# CasterlyCare — Fix Changelog

This documents every change made during this review session, in the order they
were found. Apply this on top of your original `lannister-care.zip` upload, or
just use this whole folder as your new working copy.

---

## 1. Patient could not reschedule or cancel appointments (your original report)

**Files:** `backend/src/routes/patient.js`

The frontend already had a complete Reschedule/Cancel UI that called:
- `PATCH /patient/appointments/:id/reschedule`
- `PATCH /patient/appointments/:id/cancel`

Neither route existed on the backend (404 "Route not found"). Added both,
reusing the same conflict-detection helpers used at booking time. Only
`upcoming` appointments can be touched; cancelled rows are kept (not deleted)
for history; ownership is enforced (`patientId: req.user.id`).

## 2. "No option to book a new appointment" (your latest report — NEW bug)

**Files:** `frontend/src/pages/patient/PatientAppointments.jsx`,
`frontend/src/pages/patient/PatientMedicines.jsx`

`components/ui.jsx`'s `PageHeader` component only accepts a prop called
`action` (singular). `PatientAppointments.jsx` was passing `actions` (plural)
and `description` (should be `subtitle`) — neither prop name matches, so React
silently drops them. The "+ Book Appointment" button in the page header never
rendered.

This wasn't fully hidden, though: if a patient had **zero** upcoming
appointments, a fallback "Book Appointment" button inside the empty-state
still worked. But **once a patient had at least one upcoming appointment**,
that empty-state disappeared too, and the header button — the only remaining
way to book another one — was silently missing. That matches exactly what you
reported.

Fixed both prop names in `PatientAppointments.jsx`. Also found and fixed the
same copy-paste mistake in `PatientMedicines.jsx` (there it only hid a
harmless "last updated" timestamp, not a button, but it was the same bug).

## 3. Deactivated doctor's SOS alerts vanished into a black hole

**Files:** `backend/src/routes/patient.js`

`POST /patient/sos` only checked `dutyStatus === 'on_duty'`, never `isActive`.
A patient whose doctor was deactivated (not just off-duty) got a false-success
message, and the alert sat as "pending" against a doctor who could no longer
log in — invisible to both that doctor and the admin escalation queue. Fixed
by treating a deactivated doctor the same as off-duty, so the alert correctly
escalates to admin instead.

## 4. Deactivating a doctor didn't revoke their existing login session

**Files:** `backend/src/middleware/auth.js`

The `authenticate` middleware only verified the JWT signature/expiry, never
re-checked `isActive` against the database. A doctor deactivated by admin
could keep using the API — including writing new clinical notes — for up to
7 days on their existing token. Fixed by adding a DB check of `isActive` on
every authenticated request (403 if deactivated).

## 5. File upload validation errors returned HTTP 500 instead of 400/413

**Files:** `backend/src/middleware/upload.js`, `backend/src/server.js`

Rejecting a bad file type or an oversized file threw a plain `Error` with no
`.status`, which fell through to the generic 500 handler. The frontend's
`normalizeApiError` (in `frontend/src/api/errors.js`, unmodified) discards the
real error message for any 5xx response and shows "The CasterlyCare service is
temporarily unavailable" — so a doctor uploading the wrong file type would see
a misleading "service is down" message instead of "only PDF/JPG/PNG allowed."
Fixed by tagging validation errors `400` and mapping Multer's own errors
(e.g. file-too-large) to `400`/`413` in the central error handler.

## 6. No way to re-admit a discharged patient under a new doctor

**Files:** `backend/src/routes/patient.js` (new route),
`frontend/src/api/services/patient.js`, `frontend/src/pages/patient/PatientHome.jsx`

Per the original spec, a patient's mapping to a doctor is temporary — once
discharged, they should be able to start a new recovery episode under a new
doctor. There was no endpoint anywhere to do this; signup only creates
brand-new accounts, and email must stay unique, so a returning patient could
never get a second episode. Added `POST /patient/care-episodes`: an
authenticated patient with no active episode can submit a new doctor's Unique
ID + surgery name (same pattern as signup) to start a new `Surgery` +
`CareEpisode`. Blocked with 409 if they already have an active episode.
Also added a "Start a new recovery episode" form on the Patient Home page,
shown only when there is no active episode (previously that state showed a
dead-end SOS button and an unhelpful empty message).

## 7. Socket.IO real-time layer was almost entirely dead code

**Files:** `backend/src/server.js`, `backend/src/utils/realtime.js` (new),
`backend/src/routes/patient.js`, `backend/src/routes/doctor.js`,
`backend/src/routes/admin.js`, `frontend/src/pages/admin/AdminEscalations.jsx`

The frontend sends its JWT in the socket handshake (`auth: { token }`), but
the backend never read it — connections were anonymous, and no socket was
ever joined to a `doctor:<id>` room, so every targeted `io.to(...).emit(...)`
call was firing into an empty room. Separately, the frontend's declared event
contract (`config/realtimeEvents.js`: `sos_created`, `appointment_created`,
etc.) didn't match the ad hoc event names the backend was actually emitting.

Fixed:
- `server.js` now authenticates every socket connection (rejects if the JWT
  is missing/invalid) and auto-joins `user:<id>`, plus `doctor:<id>` /
  `role:admin` based on role.
- New `utils/realtime.js` provides `notifyUser`/`notifyDoctor`/`notifyAdmins`/
  `notifyPatientAndDoctor` helpers using the frontend's real event names.
- Wired into every mutation point: SOS create/acknowledge/dispatch-resolve,
  appointment create/reschedule/cancel/complete (patient, doctor, and admin
  routes), recovery-days adjustment, discharge, and new care-episode creation.
- `AdminEscalations.jsx` previously had **zero** refresh mechanism after
  initial page load. Now has both an instant socket subscription and a 10s
  polling fallback — this is the off-duty/deactivated-doctor emergency
  dispatch queue, so it shouldn't depend on the socket alone.

Verified with a real `socket.io-client` test harness (not just HTTP checks):
unauthenticated connections are rejected; SOS/appointment events are
delivered live to the correct rooms; a deactivated-doctor SOS escalation is
now pushed to a connected admin in real time.

## 8. Admin's appointment reschedule was missing a patient-conflict check

**Files:** `backend/src/routes/admin.js`

The admin drag-and-drop reschedule endpoint only checked for doctor-side
clashes, not patient-side ones. Harmless today only because of the
one-doctor-per-patient assumption that fix #6 above removes. Added the same
patient-conflict check used everywhere else, plus a realtime emit.

## 9. Archived (closed) Priority Inbox chats were unreachable

**Files:** `backend/src/routes/doctor.js` (new route),
`frontend/src/api/services/doctor.js`,
`frontend/src/pages/doctor/DoctorPatientDetails.jsx`

Closing a chat correctly keeps the data (not deleted, per spec: "archived...
for legal compliance"), but no route or UI anywhere ever returned closed
threads — the data survived in the database but was permanently unreachable
through the app. Added `GET /doctor/patients/:patientId/chat-history`,
authorized against "has this doctor *ever* had a care episode with this
patient" (not only currently-active), since the point of archiving is to
let the doctor look back after discharge. Added an "Emergency Chat History"
panel to the patient details page.

## 10. Patient could self-select recovery duration (should be doctor's call)

**Files:** `frontend/src/pages/auth/Signup.jsx`,
`frontend/src/pages/patient/PatientHome.jsx`

Both the original signup form and my new "start new recovery episode" form
had a "Recovery duration" number input the patient filled in themselves.
Per the actual design intent, recovery duration is the doctor's call (they
have +/- controls on the patient details page) — the patient shouldn't be
choosing it. Removed both inputs; they now silently default to 14 days on
creation, with a note that the surgeon sets/adjusts the real number
afterward in the patient record.

## 11. Recovery days never actually counted down

**Files:** `backend/src/utils/recovery.js` (new),
`backend/src/utils/scheduler.js` (new), `backend/src/server.js`,
`backend/src/routes/patient.js`, `backend/src/routes/doctor.js`,
`backend/src/routes/admin.js`

`daysRemaining` was a plain stored counter that only ever changed when a
doctor pressed the [+]/[-] adjustment buttons — nothing decremented it as
real calendar days actually passed, so a recovery countdown looked frozen
forever once set, exactly as reported ("add 20 days it is staying there
only forever"). Confirmed by noticing `node-cron` was already listed as a
dependency in `package.json` but never actually used anywhere — a strong
sign a decrementing mechanism was intended but never built.

Fixed by:
- Adding `utils/recovery.js`: `computeRecovery(startDate, expectedRecoveryDays)`
  derives `daysCompleted`/`daysRemaining` live from the calendar every time
  it's needed, rather than trusting a stored counter.
- Updating every read site (patient home/profile, doctor patient
  list/details, admin appointments/SOS-escalation views) to use this live
  computation. Completed/discharged episodes and surgeries deliberately
  keep their frozen historical value instead of being recomputed — a
  surgery discharged early shouldn't start counting again just because
  time has passed since discharge.
- Rewriting the doctor's +/- adjustment endpoint
  (`POST /doctor/patients/:patientId/recovery-days`): its old math derived
  "days already completed" as `total − storedRemaining`, which was always 0
  since `storedRemaining` never moved on its own - this silently meant the
  "already completed" floor never actually protected anything. Now derives
  it from real elapsed days instead.
- Adding `utils/scheduler.js`, wired into `server.js` on startup: a daily
  job (`node-cron`, finally put to use) that writes the freshly computed
  values back into the stored columns, purely so any other code that reads
  the raw database value directly still sees a reasonably fresh number -
  the live computation above is the actual source of truth, this is just
  defense in depth.

Verified live end-to-end: signed up a patient with a 20-day recovery plan,
directly backdated their `startDate` by 5 days in the database, and
confirmed every dashboard correctly showed **15 remaining** (not 20) without
any manual doctor action. Also verified the doctor's +/- adjustment now
correctly reports `daysCompleted: 5` instead of 0, that reducing the total
below already-elapsed days is still blocked, that discharging a patient
mid-recovery freezes their historical record at the discharge-time value,
and that the scheduler function itself correctly overwrites a deliberately
corrupted stored value with the correct computed one.

## 12. File view/download always failed with "Missing or invalid authorization header"

**Files:** `frontend/src/api/client.js`,
`frontend/src/pages/doctor/DoctorPatientDetails.jsx`,
`frontend/src/pages/patient/PatientLabReports.jsx`

Both the doctor's file list and the patient's Lab Reports vault opened
files with a plain `<a href target="_blank">` link. That's just a normal
browser navigation — it never carries the app's Authorization header, so
every click failed with a 401 regardless of whether the user was logged
in. Fixed by adding `openSecureFile()` to `api/client.js`, which fetches
the file as an authenticated blob (with the current JWT attached, plus the
lab-reports step-up token when present) and opens *that* in a new tab
instead of a plain link. The tab is opened synchronously before the fetch
so browsers don't treat it as a blocked popup. Verified directly at the
HTTP level: the same URL returns 401 with no Authorization header and 200
with one, confirming the root cause and the fix.

## 13. Medicine reminder time always rejected as invalid, even when picked correctly

**Files:** `frontend/src/pages/doctor/DoctorPatientDetails.jsx`

The `AlarmTimePicker` component outputs values like `"8:00 AM"` (12-hour),
but the backend's medicine route strictly validates times as 24-hour
`"HH:MM"` (e.g. `"08:00"`) and rejects anything else — so *every*
submission failed no matter what was actually selected. Fixed by
converting 12-hour → 24-hour at the point of submission, right before the
API call. Verified: submitting the old 12-hour format still correctly
fails validation (proving that was the real cause), and the converted
24-hour format succeeds.

## 14. Doctor's recovery tracker (+/- days) never worked correctly

**Files:** `frontend/src/pages/doctor/DoctorPatientDetails.jsx`

The component read `surgery.recoveryTotalDays` /
`surgery.recoveryDaysRemaining`, but the backend's patient-details response
never puts those fields on `surgery` at all — they live on a separate
`recovery` object, under different key names (`totalDays`/`daysRemaining`).
The donut and the +/- buttons were always reading `undefined`, which
computed to 0 — permanently disabling the "Reduce" button and showing a
donut stuck at 0/0 regardless of the real recovery plan. Fixed by pointing
the component at `data.recovery` instead. Verified by fetching the actual
API response and confirming the field names/locations match the fix.

## 15. Appointment booking rebuilt around admin-managed fixed time slots

**Files:** `backend/src/models/AppointmentSlot.js` (new),
`backend/src/routes/admin.js`, `backend/src/routes/patient.js`,
`frontend/src/api/services/admin.js`, `frontend/src/api/services/patient.js`,
`frontend/src/pages/admin/AdminAppointments.jsx`,
`frontend/src/pages/patient/PatientAppointments.jsx`, `frontend/src/index.css`

Per a reference screenshot (a hospital booking page with a fixed grid of
time slots the patient picks from, greyed out when already taken),
appointment times are no longer freely typed by the patient — they're
fixed by the admin and chosen from a grid, matching that UX.

- New `AppointmentSlot` model: admin-defined recurring times of day (e.g.
  "09:00", "09:15"). Soft-deleted (not hard-deleted) when removed, so a
  historical appointment booked into a since-retired slot still makes
  sense in the record.
- `GET/POST /admin/slot-times` and `DELETE /admin/slot-times/:id` — admin
  manages the list. Added a "Appointment slot times" panel at the top of
  the Master Appointment Calendar page for this.
- `GET /patient/appointments/available-slots?date=` — returns every active
  slot time for a date, each flagged available/taken based on the
  patient's own doctor's existing bookings that day.
- Both the patient's booking route and reschedule route now reject any
  time that isn't a currently-active admin-defined slot, enforced
  server-side (not just hidden in the UI).
- Rebuilt step 3 of the patient's booking wizard, and the Reschedule
  modal, around a horizontal date strip (next 21 days, 4 visible at a
  time with ‹ › navigation) above a grid of time-slot buttons — taken
  slots are greyed out and struck through, matching the reference
  screenshot.

Verified live end-to-end: added slot times as admin, confirmed a patient
sees them all as available, booked one, confirmed it immediately flipped
to unavailable for that date, confirmed booking an arbitrary non-slot time
is rejected (400), confirmed booking the same slot again correctly reports
a conflict (409, not a slot-validation error), and confirmed rescheduling
to a different valid slot succeeds.

**Note / open decision:** this restriction currently applies only to
patient-initiated booking and rescheduling. The doctor's own
"schedule an appointment for a patient" route (`doctor.js`) is intentionally
left accepting any time, on the assumption a doctor may need to schedule
outside the standard grid (e.g. a specific follow-up time). Say the word if
you'd rather doctors be restricted to the same slot list.

---

## Not fixed (documented, lower priority)

- **File upload trusts the client-supplied MIME type.** `fileFilter` in
  `middleware/upload.js` only checks `file.mimetype` (no magic-byte/content
  sniffing), so a file can be relabeled with a spoofed `Content-Type` and get
  stored and served back as if it were a legitimate PDF/JPG/PNG. Low urgency
  (served with `X-Content-Type-Options: nosniff`, no XSS path) but worth
  hardening with a content-inspection library if you want to close it.

---

## How to apply

This whole `lannister-care/` folder is a complete, ready-to-run copy with all
fixes applied — you can use it directly in place of your original upload.
Run `npm install` in both `backend/` and `frontend/`, and `pip install -r
requirements.txt` (in a venv) for `backend/ml-service/`, same as before.
