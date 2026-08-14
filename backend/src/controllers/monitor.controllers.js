import asyncHandler from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import ApiResponse from "../utils/ApiResponse.js"
import Monitor from "../models/monitor.model.js"
import Check from "../models/check.model.js"
import { startMonitor, stopMonitor, restartMonitor } from "../services/scheduler.service.js"

// Uptime = checks that actually ran / total checks that ran.
// Does NOT penalize for periods when URLPulse itself was offline.
// Returns null when no data exists yet (monitor just created).
const calcUptime24h = async (monitorId) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const checks = await Check.find({ monitorId, timestamp: { $gte: since } })
    if (checks.length === 0) return null
    const upCount = checks.filter(c => c.isUp).length
    return parseFloat(((upCount / checks.length) * 100).toFixed(2))
}

const createMonitor = asyncHandler(async (req, res) => {
    const { name, url, intervalSeconds, webhookUrl, alertThreshold } = req.body

    if (!name?.trim() || !url?.trim()) {
        throw new ApiError(400, "Name and URL are required")
    }

    // Validate URL format
    try {
        const parsed = new URL(url)
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error()
    } catch {
        throw new ApiError(400, "URL must start with http:// or https://")
    }

    // Validate webhookUrl if provided
    if (webhookUrl) {
        try {
            const parsed = new URL(webhookUrl)
            if (!["http:", "https:"].includes(parsed.protocol)) throw new Error()
        } catch {
            throw new ApiError(400, "Webhook URL must start with http:// or https://")
        }
    }

    // alertThreshold must be a positive integer if provided
    if (alertThreshold !== undefined && (!Number.isInteger(Number(alertThreshold)) || Number(alertThreshold) < 1)) {
        throw new ApiError(400, "alertThreshold must be a positive integer")
    }

    const monitor = await Monitor.create({
        userId: req.user._id,
        name: name.trim(),
        url: url.trim(),
        intervalSeconds: intervalSeconds || 60,
        webhookUrl: webhookUrl?.trim() || null,
        alertThreshold: alertThreshold ? Number(alertThreshold) : 3
    })

    startMonitor(monitor)

    return res
        .status(201)
        .json(new ApiResponse(201, { monitor }, "Monitor created successfully"))
})

const getAllMonitors = asyncHandler(async (req, res) => {
    const monitors = await Monitor.find({ userId: req.user._id }).sort({ createdAt: -1 })

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
            webhookUrl: m.webhookUrl,
            alertThreshold: m.alertThreshold,
            consecutiveFailures: m.consecutiveFailures,
            currentStatus: lastCheck ? (lastCheck.isUp ? "up" : "down") : "unknown",
            lastCheckedAt: lastCheck?.timestamp || null,
            lastResponseTimeMs: lastCheck?.responseTimeMs || null,
            uptimePercent24h
        }
    }))

    return res
        .status(200)
        .json(new ApiResponse(200, { monitors: enriched }, "Monitors fetched successfully"))
})

const getMonitorById = asyncHandler(async (req, res) => {
    const monitor = await Monitor.findOne({ _id: req.params.id, userId: req.user._id })
    if (!monitor) throw new ApiError(404, "Monitor not found")

    const lastCheck = await Check.findOne({ monitorId: monitor._id }).sort({ timestamp: -1 })
    const uptimePercent24h = await calcUptime24h(monitor._id)

    const recentChecks = await Check.find({ monitorId: monitor._id })
        .sort({ timestamp: -1 })
        .limit(20)

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const totalChecks24h = await Check.countDocuments({
        monitorId: monitor._id,
        timestamp: { $gte: since24h }
    })

    const upChecks24h = await Check.find({
        monitorId: monitor._id,
        timestamp: { $gte: since24h },
        isUp: true
    })

    const avgResponseMs = upChecks24h.length > 0
        ? Math.round(upChecks24h.reduce((sum, c) => sum + c.responseTimeMs, 0) / upChecks24h.length)
        : null

    return res
        .status(200)
        .json(new ApiResponse(200, {
            monitor: {
                _id: monitor._id,
                name: monitor.name,
                url: monitor.url,
                intervalSeconds: monitor.intervalSeconds,
                isActive: monitor.isActive,
                createdAt: monitor.createdAt,
                webhookUrl: monitor.webhookUrl,
                alertThreshold: monitor.alertThreshold,
                consecutiveFailures: monitor.consecutiveFailures,
                currentStatus: lastCheck ? (lastCheck.isUp ? "up" : "down") : "unknown",
                lastCheckedAt: lastCheck?.timestamp || null,
                uptimePercent24h,
                totalChecks24h,
                avgResponseMs,
                recentChecks
            }
        }, "Monitor fetched successfully"))
})

const deleteMonitor = asyncHandler(async (req, res) => {
    const monitor = await Monitor.findOne({ _id: req.params.id, userId: req.user._id })
    if (!monitor) throw new ApiError(404, "Monitor not found")

    stopMonitor(monitor._id)
    await Check.deleteMany({ monitorId: monitor._id })
    await Monitor.findByIdAndDelete(monitor._id)

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Monitor deleted successfully"))
})

export { createMonitor, getAllMonitors, getMonitorById, deleteMonitor }
