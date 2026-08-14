import dotenv from "dotenv"
dotenv.config()

import connectDB from "./db/index.js"
import app from "./app.js"
import { initScheduler } from "./services/scheduler.service.js"

const PORT = process.env.PORT || 3000

connectDB()
    .then(async () => {
        await initScheduler()

        app.listen(PORT, () => {
            console.log(`URLPulse running on port ${PORT}`)
        })
    })
    .catch((err) => {
        console.error("MongoDB connection failed:", err)
        process.exit(1)
    })
