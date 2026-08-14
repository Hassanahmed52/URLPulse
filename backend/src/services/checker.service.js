import axios from "axios"
import Check from "../models/check.model.js"
import Monitor from "../models/monitor.model.js"
import { CHECK_TIMEOUT_MS } from "../constants.js"

// Fires a POST to the monitor's webhookUrl with alert details.
// Decision: plain axios POST, no retry on webhook failure.
// If the webhook endpoint is down, we log and move on — we don't
// want webhook failures to block or crash the checker loop.
const fireWebhook = async (monitor, consecutiveFailures) => {
    if (!monitor.webhookUrl) return

    try {
        await axios.post(monitor.webhookUrl, {
            monitorId: monitor._id,
            monitorName: monitor.name,
            url: monitor.url,
            consecutiveFailures,
            alertThreshold: monitor.alertThreshold,
            message: `ALERT: "${monitor.name}" has been down for ${consecutiveFailures} consecutive checks.`,
            timestamp: new Date().toISOString()
        }, { timeout: 5000 })

        console.log(`[webhook] fired for monitor: ${monitor.name}`)
    } catch (err) {
        // Log but never throw — a broken webhook must not crash the checker
        console.error(`[webhook] failed for monitor ${monitor.name}:`, err.message)
    }
}

const checkUrl = async (monitor) => {
    const start = Date.now()

    let isUp = false
    let statusCode = null
    let responseTimeMs = 0
    let error = null

    try {
        const response = await axios.get(monitor.url, {
            timeout: CHECK_TIMEOUT_MS,
            maxRedirects: 5,
            // Don't let axios throw on 4xx/5xx — we handle status ourselves
            validateStatus: () => true
        })

        responseTimeMs = Date.now() - start
        statusCode = response.status
        isUp = response.status < 400

        if (!isUp) {
            error = `HTTP_${response.status}`
        }
    } catch (err) {
        responseTimeMs = Date.now() - start

        if (err.code === "ECONNABORTED") {
            error = "timeout"
            responseTimeMs = CHECK_TIMEOUT_MS
        } else if (err.code === "ECONNREFUSED") {
            error = "connection_refused"
        } else if (err.code === "ENOTFOUND") {
            error = "dns_error"
        } else {
            error = err.code || err.message || "unknown_error"
        }

        isUp = false
        statusCode = null
    }

    // Always persist the result — failures are data too
    const check = await Check.create({
        monitorId: monitor._id,
        isUp,
        statusCode,
        responseTimeMs,
        error
    })

    // --- Webhook alert logic ---
    // Re-fetch monitor so we have the latest consecutiveFailures value
    // (another check could have updated it between when this check started and now)
    const freshMonitor = await Monitor.findById(monitor._id)
    if (!freshMonitor) return check // monitor was deleted mid-check

    if (!isUp) {
        // Increment failure counter
        freshMonitor.consecutiveFailures += 1
        await freshMonitor.save()

        // Fire webhook if threshold hit AND we haven't already alerted for this failure run.
        // "already alerted" = lastAlertedAt is set AND consecutiveFailures hasn't reset since.
        // We re-alert every `alertThreshold` additional failures so it's not silent after the first alert.
        const shouldAlert =
            freshMonitor.webhookUrl &&
            freshMonitor.consecutiveFailures >= freshMonitor.alertThreshold &&
            freshMonitor.consecutiveFailures % freshMonitor.alertThreshold === 0

        if (shouldAlert) {
            await fireWebhook(freshMonitor, freshMonitor.consecutiveFailures)
            freshMonitor.lastAlertedAt = new Date()
            await freshMonitor.save()
        }
    } else {
        // Site is back up — reset the counter
        if (freshMonitor.consecutiveFailures > 0) {
            freshMonitor.consecutiveFailures = 0
            freshMonitor.lastAlertedAt = null
            await freshMonitor.save()
            console.log(`[checker] monitor "${freshMonitor.name}" recovered — counter reset`)
        }
    }

    return check
}

export default checkUrl
