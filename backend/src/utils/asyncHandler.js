// Wraps async route handlers so we don't need try/catch in every controller.
// Any thrown error (including ApiError) flows to Express's next(err),
// which the global error handler in app.js catches and formats.
const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next)).catch(next)
    }
}

export default asyncHandler
