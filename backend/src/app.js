import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import authRouter from "./routes/auth.routes.js"
import monitorRouter from "./routes/monitor.routes.js"

const app = express()

// CORS — allow frontend origin and credentials (cookies)
app.use(cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5500",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}))

app.use(express.json({ limit: "16kb" }))
app.use(express.urlencoded({ extended: true, limit: "16kb" }))
app.use(cookieParser())

// Serve frontend as static files — one server, no separate frontend container
app.use(express.static("../frontend"))

// API routes
app.use("/api/v1/auth", authRouter)
app.use("/api/v1/monitors", monitorRouter)

// Health check — used by docker-compose healthcheck
app.get("/health", (req, res) => res.json({ status: "ok" }))

// Global error handler — catches anything thrown with next(err) or asyncHandler
app.use((err, req, res, next) => {
    console.error(`[error] ${err.message}`)
    const status = err.statuscode || err.status || 500
    const message = err.message || "Internal Server Error"
    return res.status(status).json({
        success: false,
        statuscode: status,
        message,
        errors: err.errors || []
    })
})

export default app
