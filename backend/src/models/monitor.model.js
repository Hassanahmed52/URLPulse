import mongoose, { Schema } from "mongoose"

// A Monitor is what the user configures — the thing being watched.
// Separate from Check (the results) so we can query them independently.
const monitorSchema = new Schema(
    {
        // Which user owns this monitor — auth is per-user
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        name: {
            type: String,
            required: [true, "Monitor name is required"],
            trim: true
        },
        url: {
            type: String,
            required: [true, "URL is required"],
            trim: true
        },
        // How often to check in seconds. Minimum 30s to avoid hammering sites.
        intervalSeconds: {
            type: Number,
            required: true,
            min: [30, "Interval must be at least 30 seconds"],
            default: 60
        },
        // Soft flag — lets us pause without deleting.
        // Also used on startup: load all isActive:true monitors into scheduler.
        isActive: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
)

const Monitor = mongoose.model("Monitor", monitorSchema)

export default Monitor
