import { getMe, logout, getMonitors, createMonitor, deleteMonitor } from "./api.js"

// Redirect to login if not authenticated
let currentUser = null
try {
    const res = await getMe()
    currentUser = res.data.user
    document.getElementById("username").textContent = currentUser.username
} catch {
    window.location.href = "/login.html"
}

const logoutBtn = document.getElementById("logoutBtn")
logoutBtn.addEventListener("click", async () => {
    await logout()
    window.location.href = "/login.html"
})

// Load and render monitors
const renderMonitors = async () => {
    const tbody = document.getElementById("monitorTableBody")
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray-400">Loading...</td></tr>`

    try {
        const res = await getMonitors()
        const monitors = res.data.monitors

        if (monitors.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray-400">No monitors yet. Add one above.</td></tr>`
            return
        }

        tbody.innerHTML = monitors.map(m => {
            const isUp = m.currentStatus === "up"
            const isUnknown = m.currentStatus === "unknown"
            const statusBadge = isUnknown
                ? `<span class="px-2 py-1 rounded-full text-xs bg-gray-700 text-gray-300">Pending</span>`
                : isUp
                    ? `<span class="px-2 py-1 rounded-full text-xs bg-green-900 text-green-300">● UP</span>`
                    : `<span class="px-2 py-1 rounded-full text-xs bg-red-900 text-red-300">● DOWN</span>`

            const uptime = m.uptimePercent24h !== null
                ? `${m.uptimePercent24h}%`
                : `<span class="text-gray-500">No data</span>`

            const lastChecked = m.lastCheckedAt
                ? timeAgo(new Date(m.lastCheckedAt))
                : `<span class="text-gray-500">Never</span>`

            return `
                <tr class="border-b border-gray-700 hover:bg-gray-750 transition">
                    <td class="py-3 px-4">
                        <div class="font-medium text-white">${escHtml(m.name)}</div>
                        <div class="text-xs text-gray-400 truncate max-w-xs">${escHtml(m.url)}</div>
                    </td>
                    <td class="py-3 px-4">${statusBadge}</td>
                    <td class="py-3 px-4 text-gray-300">${uptime}</td>
                    <td class="py-3 px-4 text-gray-400 text-sm">${lastChecked}</td>
                    <td class="py-3 px-4 flex gap-2">
                        <a href="/monitor.html?id=${m._id}"
                            class="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded transition">
                            View
                        </a>
                        <button onclick="handleDelete('${m._id}', '${escHtml(m.name)}')"
                            class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition">
                            Delete
                        </button>
                    </td>
                </tr>`
        }).join("")
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-400">${err.message}</td></tr>`
    }
}

window.handleDelete = async (id, name) => {
    if (!confirm(`Delete monitor "${name}"? This also deletes all check history.`)) return
    try {
        await deleteMonitor(id)
        await renderMonitors()
    } catch (err) {
        alert(err.message)
    }
}

// Add monitor form
const form = document.getElementById("addMonitorForm")
const formError = document.getElementById("formError")
form.addEventListener("submit", async (e) => {
    e.preventDefault()
    formError.classList.add("hidden")
    const name = document.getElementById("monitorName").value.trim()
    const url = document.getElementById("monitorUrl").value.trim()
    const intervalSeconds = parseInt(document.getElementById("monitorInterval").value)

    try {
        await createMonitor({ name, url, intervalSeconds })
        form.reset()
        await renderMonitors()
    } catch (err) {
        formError.textContent = err.message
        formError.classList.remove("hidden")
    }
})

// Helpers
const escHtml = (str) => str.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]))

const timeAgo = (date) => {
    const secs = Math.floor((Date.now() - date) / 1000)
    if (secs < 60) return `${secs}s ago`
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
    return `${Math.floor(secs / 86400)}d ago`
}

await renderMonitors()
// Auto-refresh every 30 seconds
setInterval(renderMonitors, 30000)
