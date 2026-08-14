// Same pattern as CineSpot — a custom error class so every thrown error
// has a statuscode, message, and errors array in one consistent shape.
// The global error handler in app.js reads these fields to build the response.
class ApiError extends Error {
    constructor(statuscode, message = "something went wrong", errors = [], stack = "") {
        super(message)
        this.statuscode = statuscode
        this.message = message
        this.errors = errors
        this.data = null
        this.success = false

        if (stack) {
            this.stack = stack
        } else {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

export { ApiError }
