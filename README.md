<div align="center">

# AeroTrack Pro

### Smart airport baggage tracking

Track baggage through QR checkpoint scans, review explainable anomaly alerts, and view transparent delay-risk estimates.

**Academic project · MCA · PSG College of Technology**

</div>

---

## Overview

AeroTrack Pro is a full-stack baggage tracking application. Passengers can look up their bags and follow scan events, while airport staff manage checkpoint scans and baggage movement. Administrators manage users, flights, checkpoints, alerts, and audit records.

The app distinguishes verified scan data from demonstration data, predictions, cached content, and unknown information. It does not claim to know a bag's location between scans.

| Team member      | Role      | Roll number |
| ---------------- | --------- | ----------- |
| Sanjiv Kumar A   | Developer | 26MX217     |
| Dheena Dhayal M  | Developer | 26MX106     |
| Rebakha Snowit M | Developer | 26MX121     |

## Features

- **Baggage lookup:** scan a QR code, paste QR content or a tracking link, or enter a baggage ID.
- **Checkpoint tracking:** record baggage movement and view the scan history.
- **Operations board:** staff can move baggage between workflow stages using mouse, touch, or keyboard.
- **Anomaly alerts:** rule-based alerts highlight missed checkpoints, unusual scan sequences, and other operational issues.
- **Delay-risk estimates:** a transparent rules-based estimate is available by default; an optional trained model can be configured.
- **Passenger, staff, and admin dashboards:** role-based views for baggage, incidents, flights, alerts, and administration.
- **Demo data:** sample airlines and flights are labelled as demonstration data; demo baggage records can be added and reset.
- **Responsive interface:** light and dark themes, QR scanning, and print/download support for baggage tags.

> **Data note:** This project does not use a live flight-data API, airline system, airport system, or RFID reader. Sample flights are demonstrations, and baggage location is based on recorded checkpoint scans.

## Tech stack

| Layer        | Technologies                                                       |
| ------------ | ------------------------------------------------------------------ |
| Client       | HTML, CSS, JavaScript ES modules                                   |
| Server       | Node.js, Express 5                                                 |
| Database     | MongoDB with Mongoose                                              |
| Shared logic | JavaScript workspace for domain rules, QR formats, and predictions |
| Tests        | Vitest, jsdom, Supertest                                           |
| Optional ML  | Python logistic-regression training pipeline                       |

The client is served by the Node.js server. No frontend build step is required.

## Quick start

### Requirements

- Node.js **20.19 or newer**
- npm **10 or newer**
- MongoDB Atlas or another reachable MongoDB server

### Install and run

```bash
npm ci
```

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

On macOS or Linux, use `cp .env.example .env`. Edit `.env` and set at least:

- `MONGODB_URI` — your MongoDB connection string
- `SESSION_SECRET` — a unique random secret of at least 32 characters

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Start the development server:

```bash
npm run dev
```

Open **http://localhost:4000**. The server seeds the airline directory and sample flights when needed. In development mode, OTP verification codes are shown in the app when `EMAIL_PROVIDER=dev`.

> Keep `.env` private. Do not commit database credentials, email passwords, or session secrets.

## Configuration

See [.env.example](.env.example) for the available settings.

| Variable           | Purpose                                                 |
| ------------------ | ------------------------------------------------------- |
| `MONGODB_URI`      | MongoDB connection string                               |
| `MONGODB_DB_NAME`  | Database name                                           |
| `SESSION_SECRET`   | Secret used for session and one-time-code security      |
| `EMAIL_PROVIDER`   | `dev`, `smtp`, or `none`                                |
| `CLIENT_URL`       | Client origin used for links and CORS                   |
| `TRUST_PROXY`      | Set to `true` behind a trusted proxy such as Render     |
| `SERVE_CLIENT`     | Serve the client from the API server; `true` by default |
| `DELAY_MODEL_PATH` | Optional path to a trained delay model                  |

### MongoDB

Create a MongoDB database user with only the permissions the app needs, and restrict network access to the required IP addresses. URL-encode reserved characters in the database password before placing it in `MONGODB_URI`.

Check the connection with:

```bash
npm run db:check
```

### Email and OTP

Set `EMAIL_PROVIDER=dev` for local development; codes are displayed in the app and are not emailed. For real email delivery, configure `EMAIL_PROVIDER=smtp` and the `SMTP_*` and `EMAIL_FROM` settings. The server does not allow development email mode in production.

## Development commands

| Command             | Description                             |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Start the server in watch mode          |
| `npm start`         | Start the server                        |
| `npm run lint`      | Run ESLint                              |
| `npm test`          | Run shared, client, and server tests    |
| `npm run seed`      | Refresh airlines and sample flights     |
| `npm run seed:demo` | Add labelled demo baggage and scan data |
| `npm run db:check`  | Verify database connectivity            |

Server integration tests use a temporary MongoDB instance by default. They can also use a local test database via `TEST_MONGODB_URI`; **never point this setting at production data**, as tests may clear the test database.

## Roles and demo setup

New accounts are passengers. To make a registered account an administrator, run:

```bash
npm run set-role -w server -- you@example.com admin
```

Replace the example email with the account you registered. Create sample checkpoints in the admin interface or seed a starter set:

```bash
npm run seed:checkpoints -w server -- MAA DEL
```

Demo records are labelled and can be reset from the admin interface or with:

```bash
npm run seed:demo -- --reset
```

## Project structure

```text
client/   Browser app, styles, pages, components, and client tests
server/   Express API, database models, services, scripts, and tests
shared/   Domain logic shared by the client and server
ml/       Optional delay-model training pipeline
docs/     Implementation notes
```

## Security and privacy

- Passwords are hashed, and sessions are stored server-side.
- Role-based access controls restrict passenger, staff, and administrator actions.
- QR codes contain a baggage reference, not passenger or flight details.
- Inputs are validated; API requests are rate-limited and protected with security headers.
- Passenger access is scoped to their own baggage and incidents.
- Store secrets only in local environment files or your deployment provider's secret settings.

For more implementation details, see [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

## Deployment

[render.yaml](render.yaml) defines a Render web service that serves the client and API together. Before deploying:

1. Configure the MongoDB URI and a strong session secret as provider secrets.
2. Set the production URL and allowed origins correctly.
3. Configure SMTP for email verification; development email mode is not available in production.
4. Restrict database network access to the deployment environment where possible.
5. Verify the `/api/health` endpoint and test account registration over HTTPS.

Do not deploy this project with real user data until you have reviewed the configuration, access controls, and data-retention requirements.

## Limitations

- Tracking depends on checkpoint scans; the app cannot confirm a bag's location between scans.
- Airlines and flights are sample data; there is no live flight-status integration.
- Delay estimates use a rules-based baseline unless an optional model is trained and configured.
- RFID, push notifications, and airline or airport system integrations are not implemented.
- Camera-based scanning requires HTTPS or `localhost`.

---

<div align="center">

Academic project. Not affiliated with or endorsed by any airline or airport.

</div>
