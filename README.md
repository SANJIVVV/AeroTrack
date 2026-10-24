# AeroTrack Pro

Smart Airport Baggage Tracking System. MCA project, PSG College of Technology.

AeroTrack Pro tracks baggage through the airport using **QR checkpoint scans**, raises **explainable anomaly alerts**, and shows a **delay-risk estimate** with its factors and uncertainty. Every piece of data is labelled with its source: verified scan, simulated (demo), prediction, cached, or unknown.

| Team member | Role | Roll no. |
|---|---|---|
| Sanjiv Kumar A | Developer | 26MX217 |
| Dheena Dhayal M | Developer | 26MX106 |
| Rebakha Snowit M | Developer | 26MX121 |

GitHub: https://github.com/SANJIVVV

### What's in this version

* **Landing page**: "Every Bag Has a Journey." hero with an animated airliner illustration (SVG, clouds with parallax, still version for reduced motion or low-power devices), a sample flight and baggage status card, journey steps, the three lookup methods, an airline preview and FAQ. The earlier digital twin, gallery and geometric 3D model were removed.
* **Airline directory** (`/airlines`): 20 currently operating airlines with search, region filter and reset. Each card shows a licensed photo with credit (or an "Illustrative photo" label), a text brand mark (no logos) and that airline's **sample flight** (route, times, status, gate, belt, Track Baggage action), labelled demo.
* **Baggage lookup** (`/track`): one panel with three methods that all use the same server lookup: **Scan Baggage QR** (camera, scan line, success sound), **Paste QR Code Content** (accepts `AEROTRACK:BAG:<id>`, an ID, or a tracking link from this site only) and **Baggage ID** (e.g. `AT-2026-100245`). Unknown IDs show "Baggage Not Found". Looking a bag up never changes its status.
* **Baggage operations board** (`/staff/board`): 8 columns with drag and drop (mouse, touch, keyboard). See [Baggage board](#baggage-board-and-administrator-corrections).
* **Digital baggage tag** with flight, route, QR, ID and status; download or print.
* **Sound effects** (Web Audio, no audio files) with an on/off toggle in the header. Success sounds play only after the server confirms.
* **Dashboards**: passenger (profile, quick actions, my baggage, recent activity, incidents), staff, and admin overview (users, ready for collection, delayed/missing, recent audit activity), user management with status filter, flight gate/belt/status editing, audit log.
* **About** (`/about`) and **Privacy** (`/privacy`) pages; footer with Track Baggage, Airlines, Sign in/Dashboard, About Us, Privacy, GitHub and the current year.
* **OTP email verification**: 6-digit codes, hashed, valid for 5 minutes, 5 attempts, 60 s resend cooldown. Used for sign-up and password reset. The sign-in screens show an animated runway take-off.
* Light and dark themes (remembered, follows the OS by default). Responsive from 360 px.

**Language:** plain **HTML, CSS and JavaScript** in the browser (no React, no framework, no build step), and plain JavaScript (ES modules) on the Node.js + Express + MongoDB server. The browser loads the files directly; the server serves them together with the API on one port.

**No external APIs:** no flight-data API, no third-party auth and no third-party email API. Email goes through your own SMTP server via nodemailer.

### Quick start

```bash
npm install
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
# edit .env: set MONGODB_URI and SESSION_SECRET (see below)
npm run seed              # airlines and sample flights
npm run seed:demo         # optional: labelled demo bags for presentations
npm run dev
```

Open http://localhost:4000. Register, enter the code (shown on screen when `EMAIL_PROVIDER=dev`), then make yourself admin with `npm run set-role -w server -- you@example.com admin`.

---

## Contents

1. [Architecture](#architecture)
2. [Requirements](#requirements)
3. [Installation](#installation)
4. [MongoDB Atlas setup](#mongodb-atlas-setup)
5. [Email setup](#email-setup)
6. [Airlines, flights and photos](#airlines-flights-and-photos)
7. [Local development](#local-development)
8. [First admin, checkpoints and demo data](#first-admin-checkpoints-and-demo-data)
9. [QR scanning and camera permissions](#qr-scanning-and-camera-permissions)
10. [Tests and checks](#tests-and-checks)
11. [AI delay prediction](#ai-delay-prediction)
12. [Anomaly detection](#anomaly-detection)
13. [Baggage board and administrator corrections](#baggage-board-and-administrator-corrections)
14. [API endpoints](#api-endpoints)
15. [Security notes](#security-notes)
16. [Deployment preparation](#deployment-preparation)
17. [Limitations](#limitations)

---

## Architecture

```
aerotrack-pro/
├─ shared/   JavaScript domain rules used by both sides: status machine, QR format,
│            anomaly rules, delay-risk features/baseline, simulation, airlines
│            (the browser imports these directly from /shared/index.js)
├─ server/   Node.js + Express 5 + Mongoose API (JavaScript, ES modules)
│  └─ src/  config · middleware · models · routes · services · integrations/{email,flights}
│           validators · scripts · tests
├─ client/   Plain HTML + CSS + JavaScript (no framework, no build step)
│  ├─ index.html        single page shell
│  ├─ css/styles.css    all styles (light and dark themes, responsive, print)
│  ├─ js/main.js        routes; js/lib (router, api, dom helpers, icons, theme, toast)
│  ├─ js/components     layouts, baggage card, journey stepper, lookup, tour, aircraft
│  ├─ js/pages          landing, airlines, auth, passenger, staff, board, admin, general
│  ├─ js/config.js      optional API base URL / public URL for split hosting
│  ├─ vendor/           html5-qrcode and qrcode (local copies, no CDN)
│  └─ test/             Vitest + jsdom tests
├─ ml/       Python training pipeline for the optional logistic-regression delay model
└─ docs/     IMPLEMENTATION_STATUS.md
```

* **Auth**: server-side sessions. The httpOnly cookie holds a random token; MongoDB stores only its SHA-256 hash, so logout and password resets invalidate sessions immediately. Passwords are hashed with bcrypt (cost 12).
* **Roles**: `passenger`, `staff`, `admin`, enforced on every API route. New accounts are always passengers.
* **Models**: User, Session, AuthToken, Flight, Checkpoint, Baggage, BaggageEvent, Incident, Notification, AnomalyAlert, PredictionRecord, AuditEvent (plus DevEmail for the development outbox). Demo records carry `isDemo: true`.

## Requirements

* Node.js 20.19+ (22 LTS recommended) and npm 10+
* A MongoDB Atlas cluster (or any MongoDB 6+ server)
* Optional: Python 3.10+ for the ML pipeline

## Installation

```bash
npm ci                 # installs all workspaces from the lockfile
cp .env.example .env   # then edit .env locally (never commit it)
```

On Windows PowerShell use `Copy-Item .env.example .env`.

Generate a session secret and paste it into `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## MongoDB Atlas setup

The app reads the connection string only from `MONGODB_URI`. It is validated at startup (a `<placeholder>` left in the URI is rejected), and logs show the host only, never the password.

1. **Rotate the password first.** Treat any database password that has ever been shared in chat, email or a document as compromised. In Atlas go to **Database Access → sanjivvv19_db_user → Edit → Edit Password**, generate a new one, and save it in a password manager.
2. **Check the user's privileges.** For this app, `readWrite` on the `aerotrack_pro` database is enough. Avoid `atlasAdmin` for the application user.
3. **Network Access.** Add only your current IP address (**Network Access → Add IP Address → Add Current IP Address**). Avoid `0.0.0.0/0` in normal use. For a cloud deployment, add the host's outbound IPs if the provider publishes them; if it does not, `0.0.0.0/0` combined with a strong rotated password is the fallback, and you should remove it after the demonstration.
4. **Put the URI in `.env`** (local file only):

   ```
   MONGODB_URI=mongodb+srv://sanjivvv19_db_user:<URL_ENCODED_PASSWORD>@aerotrack.7fv3sq4.mongodb.net/aerotrack_pro?retryWrites=true&w=majority
   ```

   **Percent-encode the password** if it contains reserved characters. Encode only the password part:

   | Character | Encoded |
   |---|---|
   | `@` | `%40` |
   | `:` | `%3A` |
   | `/` | `%2F` |
   | `?` | `%3F` |
   | `#` | `%23` |
   | `%` | `%25` |
   | `&` | `%26` |
   | `+` | `%2B` |
   | space | `%20` |

   Quick way: `node -e "console.log(encodeURIComponent(process.argv[1]))" "your-password"` (run it locally, and clear your shell history afterwards if needed).
5. **Confirm the connection**: run `npm run db:check`. It connects, pings, writes, reads back and deletes one test document in a `_connection_checks` collection, and prints only the host. Then start the server (`npm run dev`) and open http://localhost:4000/api/health. You should see `"database":{"state":"connected","ping":true}`. If it fails, the log names the host (without credentials) and the driver's reason, typically an IP not on the access list or a wrong password.

## Email setup

`EMAIL_PROVIDER` chooses how one-time codes (sign-up verification and password reset) and notifications are handled:

| Mode | What happens |
|---|---|
| `smtp` | Sent with nodemailer through your SMTP server. Needs `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`. For Gmail use an **App Password** (Google Account → Security → 2-Step Verification → App passwords), host `smtp.gmail.com`, port 587. |
| `dev` | **Nothing is sent.** The code is shown on screen in a box marked *Development mode* and kept in an in-memory outbox (last 20, lost on restart). The server refuses to start with `dev` when `NODE_ENV=production`. |
| `none` | No email at all. Sign-up cannot be completed until email is configured. |

### How OTP verification works

1. Register → the server creates a 6-digit code with a cryptographic random generator, stores only an HMAC-SHA256 hash of it (keyed with `SESSION_SECRET`), and emails the code.
2. The code is valid for **5 minutes** and can be tried **5 times**; after that the user must request a new one.
3. "Resend code" has a **60 second cooldown**; a new code invalidates the old one.
4. Responses are the same whether or not an email is registered, so accounts cannot be enumerated.
5. Sign-in is blocked (`EMAIL_NOT_VERIFIED`) until the email is verified. Forgot password uses the same kind of code.

Codes and passwords are never logged. There is no fixed or master OTP.

The app records what actually happened for each notification: `sent` (the SMTP server accepted it; this does not prove inbox delivery), `failed`, `skipped`, `dev-outbox` or `disabled`. It never claims an email was delivered.

## Airlines, flights and photos

* **Airlines:** 20 airlines (Air India, Air India Express, IndiGo, Akasa Air, SpiceJet, Emirates, Qatar Airways, Etihad, Turkish Airlines, Singapore Airlines, Malaysia Airlines, Thai Airways, Cathay Pacific, JAL, ANA, Lufthansa, British Airways, Air France, AirAsia, Qantas) are defined in `shared/src/airlines.js`. Descriptions are short general summaries; links go to each airline's official website.
  Vistara is not listed: it merged into Air India on 12 November 2024, and the directory notes this.
* **Sample flights:** one featured flight per airline (for example AI 573 MAA→BOM, 6E 6245 BLR→DEL, QP 1350 BLR→HYD, EK 542 MAA→DXB, QR 528 MAA→DOH) plus 3 routes in both directions (140 flights), with gate, baggage belt and a status derived from the scheduled time. They are not real schedules: they are stored with `isDemo: true` and labelled *Sample* everywhere. Staff can edit status, gate and belt.
* **Seeding:** the server inserts the airlines and sample flights on first start if they are missing. `npm run seed` refreshes them at any time (it only touches directory and sample-flight records).
* **No live flight data.** No flight-status API is called, and a flight status never says where a suitcase is: bag location comes only from checkpoint scans.
* **Photos** are from [Unsplash](https://unsplash.com/license), loaded from Unsplash's CDN at runtime (no files in the repo). Each one was checked on its Unsplash page and is listed with photographer and link in [IMAGE_ATTRIBUTIONS.md](IMAGE_ATTRIBUTIONS.md). 18 airline cards show a photo of that airline's aircraft; Air India Express and SpiceJet show an illustrative photo, labelled as such. If a photo cannot load, a gradient placeholder is shown. Airline names are text marks; no airline logos are bundled.
* **Aircraft illustration:** the hero airliner is original SVG artwork in AeroTrack colours, not a licensed 3D model and not any airline's livery.

## Local development

```bash
npm run dev
```

* API: http://localhost:4000 (health: `/api/health`)
* Web app: http://localhost:4000 (the same server serves the HTML, CSS and JavaScript)

There is no build step. Edit a file in `client/`, refresh the browser, and the change is there. Server files restart automatically (`node --watch`).

Other scripts:

| Command | Purpose |
|---|---|
| `npm start` | Run the server without file watching (production) |
| `npm run lint` | ESLint |
| `npm test` | Shared, client (jsdom) and server (MongoDB) tests |
| `npm run seed` | Refresh airlines and sample flights |
| `npm run seed:demo` | Add labelled demo bags, scans and alerts |

## First admin, checkpoints and demo data

1. Register an account in the app and verify its email.
2. Promote it from a terminal that has database access:
   ```bash
   npm run set-role -w server -- you@example.com admin
   ```
3. Create checkpoints, either in **Admin → Checkpoints & demo**, or with a starter set for airports:
   ```bash
   npm run seed:checkpoints -w server -- MAA DEL
   ```
4. Add flights (Admin → Checkpoints & demo → Add a flight manually), or configure a live provider.
5. For presentations: **Seed demo data** on the same page (or `npm run seed:demo`). Remove it with **Reset demo data** (or `npm run seed:demo -- --reset`). Reset deletes only records flagged `isDemo`.

Staff accounts are created the same way with role `staff`, or from **Admin → Users & roles**.

## QR scanning and camera permissions

* Each bag gets a reference such as `AT-2026-100245` (older `AT-XXXX-XXXX` references still work). The QR code contains only `AEROTRACK:BAG:<reference>`, with no name, flight or contact data. Users must sign in to resolve it, and passengers see only their own bags.
* Three lookup methods on `/track` share one lookup: camera scan, **Paste QR Code Content**, and **Baggage ID**. A pasted link is accepted only from this site's origin (or `AEROTRACK_PUBLIC_URL` in `client/js/config.js`) and is never opened. Looking up a bag never changes its status; only checkpoint scans by staff and the baggage board do.
* Browsers allow camera access only on **HTTPS or `localhost`**. To test on a phone during development, use an HTTPS tunnel or deploy over HTTPS; plain `http://<lan-ip>` will block the camera.
* When asked, choose **Allow**. If you blocked it, re-enable it from the padlock / site-settings icon in the address bar.
* Fallbacks are always available: **Scan from photo** and **manual entry**.
* Scans are idempotent (each request carries a UUID), duplicate reads within 2 minutes are not recorded twice, backward moves are refused, skipped checkpoints and wrong-airport scans raise alerts, and repeated invalid codes at one checkpoint raise a scanner alert.
* RFID: the `Checkpoint.readerKind` field reserves `rfid` for future readers. **No RFID integration exists.**

## Tests and checks

```bash
npm run lint
npm test
```

Server integration tests need a MongoDB-compatible server:

* By default they start a temporary `mongod` with `mongodb-memory-server` (it downloads a MongoDB binary on first run, so internet access is needed).
* Or point them at your own local server: `TEST_MONGODB_URI=mongodb://127.0.0.1:27017/ npm test -w server`.
* **Never point `TEST_MONGODB_URI` at Atlas production data**: tests drop their databases.

See `docs/IMPLEMENTATION_STATUS.md` for the latest recorded results.

## AI delay prediction

* **Default: transparent rules baseline** (`shared/src/prediction.js`). Additive, hand-set weights over: time at the current checkpoint versus expected, missing checkpoint scans, open anomaly alerts, flight delayed/cancelled, and "not loaded with under 45 min to departure". The UI shows the risk, level, factor contributions, a ±15-point uncertainty band, the computation time, and the disclaimer that it is **not trained or calibrated**.
* **Optional trained model**: logistic regression, chosen because each factor's contribution stays explainable.
  1. As bags are collected, the server labels earlier prediction snapshots: *delayed* if the bag ever entered Delayed/Missing, or was collected more than 60 minutes after scheduled arrival.
  2. Export labelled operational snapshots (no personal data): `npm run export:training -w server -- ../ml/data/training.csv`
  3. Train:
     ```bash
     python -m venv ml/.venv && ml/.venv/bin/pip install -r ml/requirements.txt
     ml/.venv/bin/python ml/train.py --data ml/data/training.csv
     ```
     The script refuses to train with fewer than 200 rows or 20 delayed cases. It uses a **time-based split grouped by bag** (no bag in both sets), fits scaling on the training split only, and reports ROC-AUC, PR-AUC, Brier score and accuracy for the model **and** the rules baseline on the same validation set.
  4. Set `DELAY_MODEL_PATH=ml/models/delay_model.json` and restart. `/api/health` shows which method is active.
* `--synthetic N` generates a **synthetic** dataset to exercise the pipeline. A model trained on it is labelled "synthetic" in the app, and its metrics describe the generator, not real airport performance. **No model trained on real data ships with this repository.**

## Anomaly detection

Rules in `shared/src/anomaly.js`, run on every scan and in a periodic sweep (`ANOMALY_SWEEP_INTERVAL_MIN`):

| Rule | Severity |
|---|---|
| Duplicate scan (same checkpoint and status within 120 s) | low |
| Invalid sequence (backward move, or a move after collection); the scan is refused | medium |
| Missing checkpoint (forward skip; skipping security is high) | medium / high |
| Flight mismatch (checkpoint airport differs from the flight's origin/destination) | high |
| Conflicting status (two checkpoints, different statuses, within 60 s) | medium |
| Prolonged dwell / missing-scan timeout (per-stage thresholds) | medium / high |
| Repeated scan failures (≥ 3 in 10 min at one checkpoint) | medium |

Each alert stores the bag reference, detection time, reason, evidence, severity, recommended action and an investigation history. Staff can acknowledge, investigate, escalate and resolve. Alerts describe operational irregularities only and never label anything as theft or fraud. ML-based anomaly detection is not included because there is no suitable labelled data yet.

## Baggage board and administrator corrections

`/staff/board` (staff and admins) shows the 8 main stages as columns: Registered, Check-in, Security Screening, Loaded onto Aircraft, In Transit, Arrived, Baggage Belt, Collected.

* Dragging a card sends `PATCH /api/baggage/:ref/status` with the bag's `version` in an `If-Match` header. The server checks the role, the passenger scope, the transition rules (one step forward, or resuming from Delayed/Missing), and that nobody else changed the bag meanwhile (`409` if they did). It then saves the status, adds a tracking event (`method: board`) and notifies the passenger.
* The card moves **only after the server confirms**. On any error it stays where it was, a message explains why and the board reloads. Columns that are not a valid next step are dimmed while dragging.
* Works with mouse, touch (press and hold) and keyboard (space to pick up, arrows, space to drop). Every card also has a **Move to …** button.
* **Open in Baggage Board** on a lookup result or bag page opens the board with that card highlighted.
* **Administrator correction**: admins can set any status (including backward) with `POST /api/baggage/:ref/override` and a reason of at least 10 characters. The event is marked `admin-override` and an audit entry `baggage.override` records who, from, to and why.

## API endpoints

All under `/api`. State-changing requests need the `X-Requested-With: aerotrack` header and a session cookie. P = passenger, S = staff, A = admin.

| Area | Endpoints |
|---|---|
| Health | `GET /health`, `GET /health/live` |
| Auth | `POST /auth/register`, `/auth/verify-otp`, `/auth/resend-otp`, `/auth/login`, `/auth/logout`, `/auth/logout-all`, `/auth/forgot-password`, `/auth/reset-password`; `GET /auth/me`; `GET /auth/dev-outbox` (dev email mode only) |
| Profile | `PATCH /users/me`, `POST /users/me/password` |
| Baggage | `GET /baggage` (P own, S/A all), `POST /baggage` (register), `GET /baggage/:ref` (lookup), `GET /baggage/:ref/events`, `GET /baggage/:ref/qr`, `GET /baggage/:ref/prediction`, `DELETE /baggage/:ref` |
| Board (S/A) | `GET /baggage/board`, `PATCH /baggage/:ref/status` (alias `POST /baggage/:ref/events`), `POST /baggage/:ref/override` (A, reason required) |
| Scans (S/A) | `POST /scans`, `GET /scans/recent` |
| Checkpoints | `GET /checkpoints`, `POST /checkpoints` (A), `PATCH /checkpoints/:id` (A) |
| Flights | `GET /flights`, `GET /flights/:id`, `POST /flights` (S/A), `PATCH /flights/:id` (S/A: status, gate, belt) |
| Airlines | `GET /airlines`, `GET /airlines/:code` |
| Incidents | `GET /incidents`, `POST /incidents`, `GET /incidents/:id`, `POST /incidents/:id/notes` |
| Alerts (S/A) | `GET /alerts`, `PATCH /alerts/:id`, `POST /alerts/sweep` |
| Notifications | `GET /notifications`, `POST /notifications/read` |
| Admin (A) | `GET /admin/stats`, `GET /admin/analytics`, `GET /admin/users`, `PATCH /admin/users/:id`, `GET /admin/audit` (alias `/admin/audit-logs`) |
| Demo (A) | `POST /demo/seed`, `POST /demo/reset` |

## Security notes

* Helmet security headers with a strict Content-Security-Policy; `X-Powered-By` disabled.
* CORS restricted to `CLIENT_URL` and `CORS_ORIGINS`; credentials only for those origins.
* CSRF: state-changing requests must send `X-Requested-With: aerotrack`, which cross-site pages cannot send without a CORS preflight.
* Rate limits on the API, authentication, email-sending and scan endpoints. Request bodies are limited to 50 kB.
* Every input is validated with zod, so query-operator injection such as `{"$gt": ""}` is rejected.
* Passengers can only see their own bags and incidents; other references return 404 so they cannot be enumerated.
* Logging redacts passwords, tokens, cookies, emails and the Mongo URI.
* Retention: sessions expire (`SESSION_TTL_HOURS`), one-time codes are deleted after expiry, the dev outbox lives only in memory, and audit events after 365 days.

## Deployment preparation

`render.yaml` describes a single Render web service that installs the server and serves the client from the API (`SERVE_CLIENT=true`), so cookies stay same-site.

Checklist before deploying (**do not deploy without the project owner's approval**):

1. Rotate the Atlas password and set a strong `SESSION_SECRET` in the host's secret settings, never in the repository.
2. Set `NODE_ENV=production`, `TRUST_PROXY=true`, `SERVE_CLIENT=true`, `CLIENT_URL=https://<your-service>.onrender.com`.
3. Set `EMAIL_PROVIDER=smtp` and the `SMTP_*` / `EMAIL_FROM` secrets. `dev` is refused in production.
4. Atlas Network Access: allow the host's outbound IPs (see the note in the Atlas section).
5. After deploy, check `https://<service>/api/health`, register, verify email, and run a scan over HTTPS from a phone.

Costs and limits (check current pricing pages before relying on these): Render's free web services sleep when idle and wake slowly; Atlas M0 is free with storage and connection limits; SMTP providers such as Gmail limit daily sends. HTTPS is provided by Render.

## Limitations

* Tracking is only as good as the scans: between checkpoints the position is unknown, and the app says so.
* No live flight data: airlines and flights are a local demonstration directory.
* Delay prediction is a hand-weighted baseline until enough real labelled history exists to train and validate a model.
* No RFID or airline/airport system integration.
* Browser notifications are shown only while the app is open (no push server).
* Offline mode shows cached app screens only; baggage data is not cached and the app warns when offline.
* Camera scanning could not be tested here (the test browser has no camera). Paste and manual lookup were tested in the browser; test the camera on a phone over HTTPS.
* Gate Home, Runway Home and Dream Plane Home pages did not exist in the code, so they were not added.
* Airline photos are hot-linked from Unsplash; if Unsplash is unreachable the cards fall back to a gradient.

---

Academic project. Not affiliated with or endorsed by any airline or airport.
#   A e r o T r a c k 
 
 