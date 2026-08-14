import mongoose, { Schema } from "mongoose"

// A Check is one result of one HTTP probe of a Monitor.
// We store one document per check — simple and queryable.
// Risk: table grows forever. Mitigation: TTL index auto-deletes after 30 days.
// Long-term solution (noted in README): aggregate old checks into hourly summaries.
const checkSchema = new Schema({
    monitorId: {
        type: Schema.Types.ObjectId,
        ref: "Monitor",
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        // TTL index: MongoDB auto-deletes documents 30 days after timestamp.
        // This solves the "millions of rows in 6 months" problem automatically.
        index: { expireAfterSeconds: 30 * 24 * 60 * 60 }
    },
    // true if HTTP status < 400 AND no timeout/network error
    isUp: {
        type: Boolean,
        required: true
    },
    // null when there's a timeout or network error (no response received)
    statusCode: {
        type: Number,
        default: null
    },
    // How long the request took. Capped at CHECK_TIMEOUT_MS on timeout.
    responseTimeMs: {
        type: Number,
        required: true
    },
    // Human-readable failure reason: "timeout", "ECONNREFUSED", "HTTP_404", etc.
    error: {
        type: String,
        default: null
    }
})

// Compound index: every query filters by monitorId and sorts/filters by timestamp.
// Without this index those queries do a full collection scan.
checkSchema.index({ monitorId: 1, timestamp: -1 })

const Check = mongoose.model("Check", checkSchema)

export default Check
