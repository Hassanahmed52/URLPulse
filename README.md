# URLPulse

A URL uptime monitoring service. Add URLs to watch, get background checks on a schedule, see current status, uptime percentage, and recent check history.

---

## How to Run

**Requirements:** Docker and Docker Compose installed.

```bash
git clone https://github.com/Hassanahmed52/URLPulse.git
cd URLPulse
docker-compose up --build
```

Open http://localhost:3000 — register an account, add a monitor, watch it check.

No other setup required. MongoDB data persists in a Docker volume across restarts.

---

## What's Built

**Core**
- Add, list, and delete monitored URLs (with name, URL, check interval)
- Background checking — each monitor runs on its own independent schedule via setInterval, no manual trigger needed
- Per-monitor results: current status (up/down), uptime % over last 24h, last 20 checks with status code, response time, and timestamp
- Persistence — MongoDB with a named Docker volume; all data survives restarts; scheduler reloads active monitors on startup
- Single command startup via docker-compose

**Auth (stretch requirement)**
- JWT authentication (access token in HttpOnly cookie, refresh token stored in DB)
- Monitors are per-user — you only see and manage your own monitors
- Same cookie-based auth pattern as my CineSpot project

**Not built**
- Webhooks on N consecutive failures — noted in "What I'd do next"
- Rate limiting on the API
- Pagination on checks (currently last 20, hardcoded)

---

## Three Decisions I Made

### 1. setInterval per monitor, not a job queue (deliberate simpler choice)
Each monitor needs its own independent schedule. I could have used Bull/BullMQ with Redis, or node-cron. I chose a plain `Map` of `setInterval` handles — one per monitor. It's 30 lines of code, zero extra dependencies, and easy to explain line by line. The tradeoff: it doesn't survive process crashes mid-check, and it won't work correctly if two instances run simultaneously (both Maps start, every URL gets checked twice). For a single-process service in this scope, that tradeoff is correct. I'd switch to a Redis-backed job queue if horizontal scaling was a requirement.

### 2. Fixed 10-second HTTP timeout (deliberate simpler choice)
A monitored site that hangs and never responds would block a checker indefinitely without a timeout. I set a fixed 10-second timeout via axios's `timeout` option. When it fires, axios throws with `error.code === "ECONNABORTED"` — I catch that, record `responseTimeMs = 10000`, `isUp = false`, `error = "timeout"`, and move on. I chose a fixed value rather than per-monitor configurable timeout to keep the model simple. It would be a small addition to add a `timeoutMs` field to the Monitor model.

### 3. Uptime = checks that ran, not elapsed time
Naive uptime: `(up checks / total checks) * 100`. I count only checks that actually executed. If URLPulse was down for 2 hours, those 2 hours simply have no checks — they don't count as "down" for the monitored site. This matches how Stripe, GitHub, and other major status pages calculate uptime: they don't penalize monitored services for their own monitoring downtime. The tradeoff: if both URLPulse and a monitored site were down simultaneously, the site's uptime looks artificially high. This is a known limitation and the honest tradeoff.

---

## What I'd Do Next

**Unbounded check data:** The TTL index on `Check.timestamp` auto-deletes documents after 30 days, which handles the "millions of rows in 6 months" problem. With more time I'd add an aggregation job that rolls up old checks into hourly summaries (one document per hour per monitor) for long-term trend data without storage explosion.

**Distributed duplicate checks:** If two instances of URLPulse run, both schedulers start and every URL gets checked twice. The fix is a distributed lock: before each check, attempt `findOneAndUpdate` on a `SchedulerLock` collection with an expiry field. If another instance already holds the lock, skip. I deliberately didn't implement this — it's complexity not needed for a single-process service.

**Webhooks on consecutive failures:** Store a `consecutiveFailures: Number` counter on the Monitor document. In `checker.service.js`, after saving each check: if `isUp` is false, increment and check if it's hit the threshold, then POST to a webhook URL. If `isUp` is true, reset to 0. I'd add `webhookUrl` and `alertThreshold` fields to the Monitor model.

**What "up" means:** Currently I define "up" as HTTP status < 400. A 301 redirect is up; a 404 is down. This is debatable. A more correct definition might let the user configure expected status codes per monitor.

---

## Code Attribution

Code structure (ApiError, ApiResponse, asyncHandler, verifyJWT middleware, cookie-based JWT auth, connectDB pattern) is modelled closely on my CineSpot project, which I wrote. The core of this project — checker.service.js, scheduler.service.js, the Monitor and Check models, and all frontend JS — is original to URLPulse.
