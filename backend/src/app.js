import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import authRouter from "./routes/auth.routes.js"
import monitorRouter from "./routes/monitor.routes.js"

const app = express()

app.use(cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}))

app.use(express.json({ limit: "16kb" }))
app.use(express.urlencoded({ extended: true, limit: "16kb" }))
app.use(cookieParser())

// Frontend is copied to /frontend in the Docker image (see Dockerfile)
app.use(express.static("/frontend"))

app.use("/api/v1/auth", authRouter)
app.use("/api/v1/monitors", monitorRouter)

app.get("/health", (req, res) => res.json({ status: "ok" }))

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