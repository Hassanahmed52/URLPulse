import Monitor from "../models/monitor.model.js"
import checkUrl from "./checker.service.js"

// The scheduler owns a Map of monitorId -> setInterval handle.
// One interval per monitor, each on its own independent schedule.
//
// Decision: plain setInterval over node-cron or a job queue (Bull/BullMQ).
// Reason: a job queue needs Redis, adds infra complexity, and is overkill
// for a single-process service. setInterval is 0 dependencies and easy to
// explain line by line. Tradeoff: doesn't survive process crashes mid-check.
// Noted in README under "what I'd do next".
//
// Distributed check problem: if two instances run, both Maps start, every
// URL gets checked twice. Real fix = distributed lock in MongoDB
// (findOneAndUpdate with an expiry field before each check).
// Deliberately chose NOT to solve this — noted in README.

const activeIntervals = new Map()

// Run one check immediately so the user sees a result right away,
// then set the recurring interval.
const startMonitor = (monitor) => {
    // Guard: don't start if already running
    if (activeIntervals.has(String(monitor._id))) return

    console.log(`[scheduler] starting monitor: ${monitor.name} every ${monitor.intervalSeconds}s`)

    // Immediate first check — user shouldn't wait intervalSeconds to see status
    checkUrl(monitor).catch(err =>
        console.error(`[scheduler] check failed for ${monitor.name}:`, err.message)
    )

    const handle = setInterval(() => {
        checkUrl(monitor).catch(err =>
            console.error(`[scheduler] check failed for ${monitor.name}:`, err.message)
        )
    }, monitor.intervalSeconds * 1000)

    activeIntervals.set(String(monitor._id), handle)
}

const stopMonitor = (monitorId) => {
    const id = String(monitorId)
    const handle = activeIntervals.get(id)
    if (handle) {
        clearInterval(handle)
        activeIntervals.delete(id)
        console.log(`[scheduler] stopped monitor: ${id}`)
    }
}

// Called when a monitor's interval changes — stop old, start new
const restartMonitor = (monitor) => {
    stopMonitor(monitor._id)
    startMonitor(monitor)
}

// Called once on app startup — loads all active monitors from DB
// and starts their intervals. This is how the scheduler survives restarts.
const initScheduler = async () => {
    const monitors = await Monitor.find({ isActive: true })
    console.log(`[scheduler] initializing ${monitors.length} active monitors`)
    monitors.forEach(startMonitor)
}

export { startMonitor, stopMonitor, restartMonitor, initScheduler }
