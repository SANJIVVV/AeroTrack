# AeroTrack: implementation status

Last updated: 2026-10-24 (rebuilt without React: plain HTML, CSS and JavaScript). This file records what is built and what was actually verified. Nothing here is a claim about results that were not run.

## Decisions

* **Language (2026-10-24):** the client was rebuilt in **plain HTML, CSS and JavaScript** (ES modules, no framework, no build step), and the server and shared code were converted from TypeScript to plain JavaScript. Node.js, Express 5 and MongoDB/Mongoose are unchanged, as are the API and data model. React, Vite, Tailwind, TanStack Query, React Router, dnd-kit, Framer Motion and Recharts were replaced by a small History API router, an escaping `html` template helper, hand-written CSS, pointer-event drag and drop, and hand-drawn SVG charts.
* **Reference site** (trustvault-5lgg.onrender.com): **not inspected**. Its robots.txt disallows automated access, so no design was copied from it.
* **Aircraft:** no licensed 3D model could be verified and downloaded from this environment, so the geometric 3D model was replaced with an original, realistic SVG airliner animation (climb-in, clouds with parallax, beacon lights, reduced-motion and low-power still versions). The `three`/React Three Fiber dependencies were removed.
* **Gate Home, Runway Home, Dream Plane Home:** these pages did not exist in the code, so per the prompt they were not added.
* **Vistara** is historical (merged into Air India on 12 Nov 2024); the directory notes this and lists AirAsia and Air India Express among the 20 current airlines.

## Feature status

| Area | Status | Notes |
|---|---|---|
| Homepage ("Every Bag Has a Journey.", 3 CTAs, flight panel, status preview, route animation) | Done | Digital twin, gallery, standalone drag section and photo rows removed |
| 20-airline directory with licensed photos and sample flights (gate, belt, status, Track Baggage) | Done | Sample flights are demo data, labelled. 18 airline-specific photos; 2 illustrative |
| Baggage IDs `AT-YYYY-NNNNNN`, QR payload `AEROTRACK:BAG:<id>` | Done | Old `AT-XXXX-XXXX` IDs still accepted |
| Lookup: camera scan, Paste QR Code Content (trusted origins only), Baggage ID; "Baggage Not Found" | Done | One shared lookup. Lookup never changes status |
| Sound manager with toggle | Done | Web Audio; plays only after server success |
| Baggage board (8 columns, pointer-event drag and drop, mouse/touch/keyboard) | Done | Server validates role, scope, transition and version (`If-Match`); card moves only after the server confirms |
| Admin override with reason + audit | Done | `POST /api/baggage/:ref/override`, audit `baggage.override` |
| "Open in Baggage Board" with highlight | Done | |
| Digital baggage tag (download, print) | Done | |
| Demo seed with fixed IDs incl. `AT-2026-100245` (Loaded) | Done | `npm run seed:demo`; reseeding does not duplicate |
| Passenger dashboard (profile, quick actions, my baggage, recent activity, incidents, settings, logout) | Done | |
| Admin: stats, users (search/filter, activate/deactivate), baggage, flights (status/gate/belt), audit | Done | Enforced on the server |
| About and Privacy pages, footer with dynamic year | Done | |
| Sign-in animation (runway take-off) | Done | |
| `npm run db:check` (ping + write/read/delete, host only in output) | Done | Run against the local test database only |
| MongoDB Atlas connection | Prepared | **Not verified**: needs the owner's rotated credentials in a local `.env` |
| Real SMTP email | Prepared | **Not verified** (dev mode verified) |
| Phone camera scanning | Prepared | **Not verified** (no camera in the test browser) |
| Deployment (`render.yaml`) | Prepared | Not deployed; needs owner approval |

## Verified results (run on 2026-10-24)

Server tests ran against a local MongoDB 7 replica set, not Atlas.

| Check | Result |
|---|---|
| `npm run lint` | Pass, no problems |
| Shared tests | 22 / 22 pass |
| Client tests (Vitest + jsdom: DOM helpers, router, board rules, formatting, lookup parsing) | 21 / 21 pass |
| Server tests | 48 / 48 pass |

### Browser walkthrough (Chromium via Playwright, port 4000, fresh database)

* Public: landing, airlines (search and filter), about, privacy, tutorial and 404 render with no console errors; dark mode works.
* Register with OTP (dev email mode) → guided tour → passenger dashboard. Register a bag → QR tag dialog → bag detail with journey stepper and timeline.
* Lookup: Baggage ID found and not found ("Baggage Not Found"); pasted link from another domain is refused with a message.
* Passenger is redirected to the forbidden page on admin routes.
* Incidents (passenger report, staff note), notifications (mark read), settings (profile, preferences, password) work.
* Staff scanner manual entry records a scan; alert acknowledged (status Acknowledged).
* Board: mouse drag to the next column saved (REGISTERED → CHECKED_IN); keyboard move saved (→ SECURITY_SCREENING); "Move to" button saved (→ LOADED).
* Admin analytics (charts with table view), users, audit and system pages render; seed and reset use an in-page confirmation.
* Mobile (390 px): no horizontal overflow on any tested page.
* Photos from images.unsplash.com were blocked by the test environment's network policy, so screenshots show the gradient fallback.

## Not verified

* MongoDB Atlas read/write (owner must run `npm run db:check` with their own `.env`).
* Real SMTP delivery, phone camera scanning, touch dragging on a real device, deployment.
* A drag onto an invalid column was not re-checked in this version (the server and `canMove` both reject it; the client unit test covers `canMove`).
