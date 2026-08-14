import mongoose, { Schema } from "mongoose"

const monitorSchema = new Schema(
    {
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
        intervalSeconds: {
            type: Number,
            required: true,
            min: [30, "Interval must be at least 30 seconds"],
            default: 60
        },
        isActive: {
            type: Boolean,
            default: true
        },
        // Webhook alert fields
        // webhookUrl: optional — if set, alerts are sent when threshold is hit
        // alertThreshold: how many consecutive failures before firing the webhook
        // consecutiveFailures: live counter, incremented on each down check, reset on up
        // lastAlertedAt: prevents sending duplicate alerts every check once threshold is hit
        webhookUrl: {
            type: String,
            default: null,
            trim: true
        },
        alertThreshold: {
            type: Number,
            default: 3,
            min: 1
        },
        consecutiveFailures: {
            type: Number,
            default: 0
        },
        lastAlertedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
)

const Monitor = mongoose.model("Monitor", monitorSchema)

export default Monitor
