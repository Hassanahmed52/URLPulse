import axios from "axios"
import Check from "../models/check.model.js"
import { CHECK_TIMEOUT_MS } from "../constants.js"

// The core of the product. Does one HTTP GET and saves the result.
//
// Decision: axios over node's built-in fetch — axios gives us a clean
// timeout config (timeout: ms) and error.code on failures.
// fetch() timeout requires AbortController which is more verbose.
//
// What counts as "up": HTTP status < 400.
// A 301 redirect is up. A 404 is down. Debatable — noted in README.
//
// Timeout handling: if axios throws with code ECONNABORTED, the site
// hung and never responded. We record responseTimeMs = CHECK_TIMEOUT_MS,
// isUp = false, error = "timeout". This is the "hanging site" problem
// from the requirements — the fixed timeout is what prevents a stuck check.

const checkUrl = async (monitor) => {
    const start = Date.now()

    let isUp = false
    let statusCode = null
    let responseTimeMs = 0
    let error = null

    try {
        const response = await axios.get(monitor.url, {
            timeout: CHECK_TIMEOUT_MS,
            // Don't follow more than 5 redirects — prevents infinite redirect loops
            maxRedirects: 5,
            // Treat any completed response (even 4xx/5xx) as a received response.
            // We decide up/down from status ourselves, not axios's default throw-on-4xx.
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
            // axios timeout — site never responded within CHECK_TIMEOUT_MS
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

    // Always save the result — even failures are data
    const check = await Check.create({
        monitorId: monitor._id,
        isUp,
        statusCode,
        responseTimeMs,
        error
    })

    return check
}

export default checkUrl
