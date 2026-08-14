

const BASE = "/api/v1"

const apiFetch = async (endpoint, options = {}) => {
    const res = await fetch(`${BASE}${endpoint}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || "Something went wrong")
    return data
}

// Auth
export const register = (body) => apiFetch("/auth/register", { method: "POST", body: JSON.stringify(body) })
export const login = (body) => apiFetch("/auth/login", { method: "POST", body: JSON.stringify(body) })
export const logout = () => apiFetch("/auth/logout", { method: "POST" })
export const getMe = () => apiFetch("/auth/me")

// Monitors
export const getMonitors = () => apiFetch("/monitors")
export const getMonitor = (id) => apiFetch(`/monitors/${id}`)
export const createMonitor = (body) => apiFetch("/monitors", { method: "POST", body: JSON.stringify(body) })
export const deleteMonitor = (id) => apiFetch(`/monitors/${id}`, { method: "DELETE" })
