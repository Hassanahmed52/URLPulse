import { getMe, logout, getMonitor } from "./api.js"

// Auth check
try {
    const res = await getMe()
    document.getElementById("username").textContent = res.data.user.username
} catch {
    window.location.href = "/login.html"
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
    await logout()
    window.location.href = "/login.html"
})

const params = new URLSearchParams(window.location.search)
const monitorId = params.get("id")
if (!monitorId) window.location.href = "/"

const escHtml = (str) => String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]))

const timeAgo = (date) => {
    const secs = Math.floor((Date.now() - new Date(date)) / 1000)
    if (secs < 60) return `${secs}s ago`
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
    return `${Math.floor(secs / 3600)}h ago`
}

const renderMonitor = async () => {
    try {
        const res = await getMonitor(monitorId)
        const m = res.data.monitor

        document.title = `${m.name} — URLPulse`
        document.getElementById("monitorName").textContent = m.name
        document.getElementById("monitorUrl").textContent = m.url
        document.getElementById("monitorUrl").href = m.url
        document.getElementById("monitorInterval").textContent = `Checked every ${m.intervalSeconds}s`

        const statusEl = document.getElementById("currentStatus")
        if (m.currentStatus === "up") {
            statusEl.textContent = "● UP"
            statusEl.className = "px-4 py-2 rounded-full text-sm font-bold bg-green-900 text-green-300"
        } else if (m.currentStatus === "down") {
            statusEl.textContent = "● DOWN"
            statusEl.className = "px-4 py-2 rounded-full text-sm font-bold bg-red-900 text-red-300"
        } else {
            statusEl.textContent = "Pending"
            statusEl.className = "px-4 py-2 rounded-full text-sm font-bold bg-gray-700 text-gray-300"
        }

        document.getElementById("uptimeStat").textContent =
            m.uptimePercent24h !== null ? `${m.uptimePercent24h}%` : "No data"
        document.getElementById("totalChecksStat").textContent = m.totalChecks24h ?? 0
        document.getElementById("avgResponseStat").textContent =
            m.avgResponseMs !== null ? `${m.avgResponseMs}ms` : "—"

        // Recent checks table
        const tbody = document.getElementById("checksTableBody")
        if (!m.recentChecks || m.recentChecks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-gray-400">No checks yet — first check runs in a few seconds.</td></tr>`
            return
        }

        tbody.innerHTML = m.recentChecks.map(c => {
            const badge = c.isUp
                ? `<span class="px-2 py-1 rounded-full text-xs bg-green-900 text-green-300">● UP</span>`
                : `<span class="px-2 py-1 rounded-full text-xs bg-red-900 text-red-300">● DOWN</span>`

            const code = c.statusCode
                ? `<span class="text-gray-300">${c.statusCode}</span>`
                : `<span class="text-gray-500">${escHtml(c.error || "—")}</span>`

            return `
                <tr class="border-b border-gray-700 hover:bg-gray-750 transition">
                    <td class="py-3 px-4 text-gray-400 text-sm">${timeAgo(c.timestamp)}</td>
                    <td class="py-3 px-4">${badge}</td>
                    <td class="py-3 px-4">${code}</td>
                    <td class="py-3 px-4 text-gray-300">${c.responseTimeMs}ms</td>
                </tr>`
        }).join("")
    } catch (err) {
        document.getElementById("monitorName").textContent = "Error loading monitor"
        console.error(err)
    }
}

await renderMonitor()
setInterval(renderMonitor, 30000)
