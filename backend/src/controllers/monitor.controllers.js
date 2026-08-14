import asyncHandler from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import ApiResponse from "../utils/ApiResponse.js"
import Monitor from "../models/monitor.model.js"
import Check from "../models/check.model.js"
import { startMonitor, stopMonitor } from "../services/scheduler.service.js"

// Calculate uptime % over last 24 hours.
// Decision: count only checks that actually ran — don't penalize a monitored
// site for OUR downtime. If the service was off for 2 hours, we didn't
// run checks, so those missing checks are not counted as "down".
// Tradeoff: if both us and the site were down, uptime looks artificially high.
// This matches how major status pages (Stripe, GitHub) calculate uptime.
const calcUptime24h = async (monitorId) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const checks = await Check.find({ monitorId, timestamp: { $gte: since } })

    if (checks.length === 0) return null // no data yet

    const upCount = checks.filter(c => c.isUp).length
    return parseFloat(((upCount / checks.length) * 100).toFixed(2))
}

const createMonitor = asyncHandler(async (req, res) => {
    const { name, url, intervalSeconds } = req.body

    if (!name?.trim() || !url?.trim()) {
        throw new ApiError(400, "Name and URL are required")
    }

    // Basic URL validation — must start with http:// or https://
    try {
        const parsed = new URL(url)
        if (!["http:", "https:"].includes(parsed.protocol)) {
            throw new Error()
        }
    } catch {
        throw new ApiError(400, "URL must start with http:// or https://")
    }

    const monitor = await Monitor.create({
        userId: req.user._id,
        name: name.trim(),
        url: url.trim(),
        intervalSeconds: intervalSeconds || 60
    })

    // Start checking immediately — don't wait for next interval
    startMonitor(monitor)

    return res
        .status(201)
        .json(new ApiResponse(201, { monitor }, "Monitor created"))
})

const getAllMonitors = asyncHandler(async (req, res) => {
    // Only return monitors belonging to the logged-in user
    const monitors = await Monitor.find({ userId: req.user._id }).sort({ createdAt: -1 })

    // For each monitor, attach current status and uptime
    const enriched = await Promise.all(monitors.map(async (m) => {
        const lastCheck = await Check.findOne({ monitorId: m._id }).sort({ timestamp: -1 })
        const uptimePercent24h = await calcUptime24h(m._id)

        return {
            _id: m._id,
            name: m.name,
            url: m.url,
            intervalSeconds: m.intervalSeconds,
            isActive: m.isActive,
            createdAt: m.createdAt,
            currentStatus: lastCheck ? (lastCheck.isUp ? "up" : "down") : "unknown",
            lastCheckedAt: lastCheck?.timestamp || null,
            lastResponseTimeMs: lastCheck?.responseTimeMs || null,
            uptimePercent24h
        }
    }))

    return res.status(200).json(new ApiResponse(200, { monitors: enriched }, "Monitors fetched"))
})

const getMonitorById = asyncHandler(async (req, res) => {
    const monitor = await Monitor.findOne({ _id: req.params.id, userId: req.user._id })
    if (!monitor) throw new ApiError(404, "Monitor not found")

    const lastCheck = await Check.findOne({ monitorId: monitor._id }).sort({ timestamp: -1 })
    const uptimePercent24h = await calcUptime24h(monitor._id)

    // Last 20 checks for the detail view
    const recentChecks = await Check.find({ monitorId: monitor._id })
        .sort({ timestamp: -1 })
        .limit(20)

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const totalChecks24h = await Check.countDocuments({
        monitorId: monitor._id,
        timestamp: { $gte: since24h }
    })

    // Average response time over last 24h (only up checks — down checks are noise)
    const upChecks24h = await Check.find({
        monitorId: monitor._id,
        timestamp: { $gte: since24h },
        isUp: true
    })
    const avgResponseMs = upChecks24h.length > 0
        ? Math.round(upChecks24h.reduce((sum, c) => sum + c.responseTimeMs, 0) / upChecks24h.length)
        : null

    return res.status(200).json(new ApiResponse(200, {
        monitor: {
            _id: monitor._id,
            name: monitor.name,
            url: monitor.url,
            intervalSeconds: monitor.intervalSeconds,
            isActive: monitor.isActive,
            createdAt: monitor.createdAt,
            currentStatus: lastCheck ? (lastCheck.isUp ? "up" : "down") : "unknown",
            lastCheckedAt: lastCheck?.timestamp || null,
            uptimePercent24h,
            totalChecks24h,
            avgResponseMs,
            recentChecks
        }
    }, "Monitor fetched"))
})

const deleteMonitor = asyncHandler(async (req, res) => {
    const monitor = await Monitor.findOne({ _id: req.params.id, userId: req.user._id })
    if (!monitor) throw new ApiError(404, "Monitor not found")

    // Stop the scheduler interval first, then delete data
    stopMonitor(monitor._id)

    // Delete all checks for this monitor — no orphaned data
    await Check.deleteMany({ monitorId: monitor._id })
    await Monitor.findByIdAndDelete(monitor._id)

    return res.status(200).json(new ApiResponse(200, {}, "Monitor deleted"))
})

export { createMonitor, getAllMonitors, getMonitorById, deleteMonitor }
