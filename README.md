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

## What's Built

### Core
- **Monitor management** — add, list, delete monitored URLs. Each monitor has a name, URL, check interval (30s minimum), and optional webhook config
- **Background checking** — each monitor runs on its own independent `setInterval`. No manual trigger needed. First check fires immediately on creation so you see a result right away
- **Per-check recording** — every check stores HTTP status code, response time in ms, timestamp, up/down flag, and a classified error string (`timeout`, `dns_error`, `connection_refused`, `HTTP_404`, etc.)
- **Monitor detail view** — current status (up/down), uptime % over last 24h, total checks in 24h, average response time (up checks only), last 20 checks with full detail
- **Persistence** — MongoDB with Docker volume. Scheduler reloads active monitors on startup
- **One command startup** — `docker-compose up --build`

### Auth (stretch requirement)
- JWT authentication — access token (15m) in HttpOnly cookie, refresh token (7d) stored in DB and rotated on every refresh
- Monitors are per-user — you only see and manage your own

### Webhook alerts (stretch requirement)
- Optional `webhookUrl` per monitor
- Configurable `alertThreshold` — how many consecutive failures before firing (default: 3)
- Fires a POST with monitor name, URL, failure count, and timestamp
- Re-alerts every additional `alertThreshold` failures so silence doesn't mean resolved
- Resets automatically when the site recovers

### What's not built
- Rate limiting on the API
- Pagination on check history (returns last 20, hardcoded)
- Email/SMS alerts (webhook covers the notification layer — integrates with anything that accepts a POST)
- Edit monitor (update interval or webhook URL without delete/recreate)

---

## Three Decisions I Made

### 1. setInterval per monitor, not a job queue — deliberate simpler choice
Each monitor needs its own independent schedule. I could have used Bull/BullMQ with Redis, or node-cron with a distributed lock. I chose a plain `Map` of `setInterval` handles — one entry per monitor ID. It's about 40 lines of code, zero extra dependencies, and every line is explainable.

The tradeoff: if two instances of URLPulse run simultaneously, both Maps start and every URL gets checked twice. The fix is a distributed lock — attempt a `findOneAndUpdate` on a `SchedulerLock` collection with a TTL before each check, skip if another instance holds it. I deliberately didn't build this. It's complexity that isn't needed for a single-process service and would have taken 2–3 hours that were better spent on the checker and webhook logic.

### 2. Fixed 10-second HTTP timeout
A site that hangs and never responds would block a checker indefinitely without a hard timeout. I set `timeout: 10000` in the axios config. When it fires, axios throws with `err.code === "ECONNABORTED"`. The catch block records `responseTimeMs = 10000`, `isUp = false`, `error = "timeout"` and the scheduler interval moves on normally.

I chose a fixed value rather than per-monitor configurable timeout to keep the Monitor model simple. Adding a `timeoutMs` field would be a 10-minute change — I noted it as a "next week" item instead.

### 3. Uptime = checks that ran, not wall clock time
Naive approach: `(seconds up / total seconds in window) * 100`. Problem: if URLPulse itself was down for 2 hours, those 120 minutes would count against every monitored site even though we never actually checked them.

I count only check documents that exist: `(up checks / total checks) * 100`. If we weren't running, there are no documents for that period — the gap simply doesn't exist in the calculation. This matches how Stripe, GitHub, and other major status pages calculate uptime. The known tradeoff: if both URLPulse and a monitored site were down simultaneously, the site's uptime looks artificially high. That's the honest tradeoff and it's the lesser evil.

---

## What I'd Do Next With Another Week

**Distributed duplicate-check prevention**
If two instances run, every URL is checked twice. Fix: before each check, attempt `Monitor.findOneAndUpdate({ _id, lockedUntil: { $lt: now } }, { lockedUntil: now + intervalSeconds })`. If the update returns null, another instance has the lock — skip. This makes the scheduler horizontally safe without Redis.

**Data rollup for long-term trends**
The TTL index deletes checks after 30 days. For longer history without unbounded storage: a nightly job that aggregates each monitor's checks into hourly summary documents (one doc per hour per monitor: avg response time, up count, down count). Raw checks still expire. Hourly summaries are kept indefinitely and used for the 7-day/30-day uptime graphs.

**Edit monitor**
Currently you have to delete and recreate to change the interval or webhook URL. A `PATCH /api/v1/monitors/:id` endpoint that calls `restartMonitor()` when the interval changes would take about an hour to add.

**Per-monitor timeout config**
Add `timeoutMs: { type: Number, default: 10000, min: 1000, max: 30000 }` to the Monitor model and pass it into `checker.service.js`. Trivial change, meaningful for monitoring slow but legitimate endpoints.

**Frontend webhook config**
The backend supports webhookUrl and alertThreshold but the frontend add-monitor form doesn't expose them yet. Add two optional fields to the form.

---

## Code Attribution

ApiError, ApiResponse, asyncHandler, verifyJWT middleware, cookie-based JWT auth pattern, and connectDB are modelled on my prior CineSpot project (my own code). The core of URLPulse — checker.service.js, scheduler.service.js, webhook alert logic, Monitor and Check models, and all frontend JS — is original to this project.

The project structure, inline comments explaining decisions, and README were written with AI assistance (Claude). All code is my own or reviewed and understood line by line.
