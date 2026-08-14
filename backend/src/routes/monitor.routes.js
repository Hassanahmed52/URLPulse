import { Router } from "express"
import {
    createMonitor,
    getAllMonitors,
    getMonitorById,
    deleteMonitor
} from "../controllers/monitor.controllers.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"

const router = Router()

// All monitor routes require authentication
router.use(verifyJWT)

router.post("/", createMonitor)
router.get("/", getAllMonitors)
router.get("/:id", getMonitorById)
router.delete("/:id", deleteMonitor)

export default router
