# URLPulse

A URL uptime monitoring service. Add URLs to watch, get background HTTP checks on a configurable schedule, see live status, uptime percentage, response times, and recent check history. Optional webhook alerts when a monitor fails N consecutive checks.

---

## How to Run

**Requirements:** Docker and Docker Compose installed. Nothing else.

```bash
git clone https://github.com/Hassanahmed52/URLPulse.git
cd URLPulse
docker-compose up --build
```

Open **http://localhost:3000** in your browser.

- Register an account
- Add a URL to monitor (name, URL, check interval)
- Watch it check in real time — the dashboard auto-refreshes every 30 seconds

MongoDB data is stored in a named Docker volume (`mongo_data`) and persists across restarts. The scheduler reloads all active monitors from the database on every startup, so checks resume automatically.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Runtime | Node.js 20 | Async I/O fits a polling workload naturally |
| Framework | Express 4 | Minimal, no magic, every line is explainable |
| Database | MongoDB 7 + Mongoose | TTL index handles data cleanup automatically, flexible schema |
| HTTP client | Axios | Clean timeout config and typed error codes on failures |
| Auth | JWT + bcrypt | Stateless tokens, HttpOnly cookies, no session store needed |
| Frontend | Vanilla HTML/JS + Tailwind CDN | No build step, zero dependencies, loads fast |
| Container | Docker + Docker Compose | One command startup, isolated environment |

---

## Project Structure


URLPulse/
├── backend/
│   ├── src/
│   │   ├── index.js                  ← entry point, connects DB then starts server
│   │   ├── app.js                    ← express setup, middleware, routes, error handler
│   │   ├── constants.js              ← CHECK_TIMEOUT_MS, DB_NAME
│   │   ├── db/
│   │   │   └── index.js              ← mongoose connection
│   │   ├── models/
│   │   │   ├── user.model.js         ← user schema, bcrypt, JWT methods
│   │   │   ├── monitor.model.js      ← URL config + webhook fields + failure counter
│   │   │   └── check.model.js        ← one document per HTTP probe, TTL index
│   │   ├── controllers/
│   │   │   ├── auth.controllers.js   ← register, login, logout, refresh token
│   │   │   └── monitor.controllers.js← CRUD, uptime calc, enriched responses
│   │   ├── services/
│   │   │   ├── checker.service.js    ← does the HTTP GET, classifies errors, fires webhooks
│   │   │   └── scheduler.service.js  ← Map of setIntervals, one per monitor
│   │   ├── middlewares/
│   │   │   └── auth.middleware.js    ← verifyJWT, attaches req.user
│   │   └── routes/
│   │       ├── auth.routes.js        ← /api/v1/auth/*
│   │       └── monitor.routes.js     ← /api/v1/monitors/* (all protected)
│   └── Dockerfile
├── frontend/
│   ├── index.html                    ← dashboard, monitor list + add form
│   ├── monitor.html                  ← detail view, recent checks table
│   ├── login.html
│   ├── register.html
│   └── js/
│       ├── api.js                    ← all fetch calls, credentials always sent
│       ├── index.js                  ← dashboard logic, auto-refresh
│       └── monitor.js                ← detail page logic, auto-refresh
└── docker-compose.yml

---

## How Data Flows

User registers / logs in
        ↓
JWT access token set in HttpOnly cookie (15m)
Refresh token stored in DB (7d), rotated on every refresh
        ↓
User adds a monitor (name, URL, interval, optional webhookUrl + alertThreshold)
        ↓
POST /api/v1/monitors
        ↓
Monitor document saved in MongoDB
        ↓
scheduler.service.js → startMonitor()
  - fires first check immediately (user sees result right away)
  - sets a setInterval for every subsequent check
        ↓
Every N seconds: checker.service.js → checkUrl()
  - axios.GET(url) with 10s timeout
  - records: isUp, statusCode, responseTimeMs, error string
  - saves a Check document to MongoDB
  - if isUp=false: increments consecutiveFailures on Monitor
  - if consecutiveFailures >= alertThreshold: fires POST to webhookUrl
  - if isUp=true: resets consecutiveFailures to 0
        ↓
Frontend polls GET /api/v1/monitors and GET /api/v1/monitors/:id every 30s
  - shows current status, uptime %, avg response time, last 20 checks
        ↓
On app restart:
  - connectDB() resolves
  - initScheduler() loads all isActive monitors from DB
  - restarts their setIntervals — checks resume without any user action

---

## API Endpoints

All monitor endpoints require the `AccessToken` cookie (set at login).

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Register, returns tokens in cookies |
| POST | `/api/v1/auth/login` | Login, returns tokens in cookies |
| POST | `/api/v1/auth/logout` | Clears cookies, invalidates refresh token |
| POST | `/api/v1/auth/refresh-token` | Rotates access + refresh token |
| GET | `/api/v1/auth/me` | Returns current user |

### Monitors
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/monitors` | Create monitor, starts checking immediately |
| GET | `/api/v1/monitors` | List all your monitors with current status + uptime |
| GET | `/api/v1/monitors/:id` | Detail view — last 20 checks, avg response, stats |
| DELETE | `/api/v1/monitors/:id` | Delete monitor + all its check history |

### Monitor create body
{
  "name": "My Site",
  "url": "https://example.com",
  "intervalSeconds": 60,
  "webhookUrl": "https://webhook.site/your-id",
  "alertThreshold": 3
}

`webhookUrl` and `alertThreshold` are optional. Default threshold is 3.

---

## What's Built

### Core
- Monitor management — add, list, delete URLs with name, interval, webhook config
- Background checking — independent `setInterval` per monitor, first check fires immediately
- Per-check recording — status code, response time, timestamp, up/down, classified error
- Monitor detail — uptime % (24h), total checks, avg response time, last 20 checks
- Persistence — Docker volume, scheduler reloads on restart
- One command startup

### Stretch
- JWT auth with refresh token rotation — monitors are per-user
- Webhook alerts — POST on N consecutive failures, re-alerts every N additional failures, resets on recovery

### Not built
- Rate limiting on the API
- Pagination on check history (last 20, hardcoded)
- Edit monitor (change interval or webhook URL without delete/recreate)
- Frontend form fields for webhookUrl and alertThreshold (configure via API/curl for now)

---

## Three Decisions I Made

### 1. setInterval per monitor, not a job queue — deliberate simpler choice
Each monitor needs its own independent schedule. I could have used Bull/BullMQ with Redis or node-cron. I chose a plain `Map` of `setInterval` handles — one entry per monitor ID. It is about 40 lines of code, zero extra dependencies, and every line is explainable.

The tradeoff: if two instances of URLPulse run simultaneously, both Maps start and every URL gets checked twice. The fix is a distributed lock — attempt a `findOneAndUpdate` on a lock document with a TTL before each check, skip if another instance holds it. I deliberately did not build this. It is complexity that is not needed for a single-process service and would have taken time better spent on the checker and webhook logic.

### 2. Fixed 10-second HTTP timeout
A site that hangs and never responds would block a checker indefinitely without a hard timeout. I set `timeout: 10000` in the axios config. When it fires, axios throws with `err.code === "ECONNABORTED"`. The catch block records `responseTimeMs = 10000`, `isUp = false`, `error = "timeout"` and the interval moves on normally.

I chose a fixed value rather than per-monitor configurable timeout to keep the Monitor model simple. Adding a `timeoutMs` field would be a small change — noted as a next-week item.

### 3. Uptime = checks that ran, not wall clock time
If URLPulse itself was offline for 2 hours, those 120 minutes would count against every monitored site under a wall-clock calculation even though no checks ran. I count only check documents that exist: `(up checks / total checks) * 100`. Gaps where we were not running simply do not exist in the data. This matches how Stripe and GitHub calculate uptime on their status pages. The known tradeoff: if both URLPulse and a monitored site were down simultaneously, the site uptime looks artificially high. That is the honest lesser evil.

---

## What I Would Do Next With Another Week

**Distributed duplicate-check prevention**
If two instances run, every URL is checked twice. Fix: before each check, attempt `Monitor.findOneAndUpdate({ _id, lockedUntil: { $lt: now } }, { lockedUntil: now + intervalSeconds })`. If the update returns null, another instance holds the lock — skip. No Redis needed.

**Data rollup for long-term trends**
The TTL index deletes raw checks after 30 days. For longer history: a nightly job aggregates each monitor's checks into hourly summary documents (avg response time, up count, down count per hour). Raw checks expire. Summaries are kept indefinitely and used for 7-day and 30-day uptime graphs.

**Edit monitor**
A `PATCH /api/v1/monitors/:id` endpoint that updates interval or webhook config and calls `restartMonitor()` when the interval changes. About an hour of work.

**Frontend webhook config**
The backend supports webhookUrl and alertThreshold but the add-monitor form does not expose them. Two optional input fields in the form.

**Per-monitor timeout config**
Add `timeoutMs` to the Monitor model, pass it into checker.service.js. Small change, useful for slow but legitimate endpoints.
