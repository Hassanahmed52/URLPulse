export const DB_NAME = process.env.DB_NAME || "urlpulse"

// Hard timeout for each HTTP check.
// Deliberate decision: fixed at 10s rather than per-monitor configurable.
// Reason: keeps the model simple. A hanging site gets recorded as
// "timeout" after 10s and the scheduler moves on. Documented in README.
export const CHECK_TIMEOUT_MS = 10000
