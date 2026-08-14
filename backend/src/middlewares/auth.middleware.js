import jwt from "jsonwebtoken"
import { ApiError } from "../utils/ApiError.js"
import asyncHandler from "../utils/asyncHandler.js"
import User from "../models/user.model.js"

// Reads AccessToken from HttpOnly cookie (set at login).
// Attaches req.user so controllers know who is making the request.
// Identical pattern to CineSpot auth.middleware.js — cookie-based JWT.
export const verifyJWT = asyncHandler(async (req, res, next) => {
    const token = req.cookies?.AccessToken ||
        req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
        throw new ApiError(401, "Unauthorized request")
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)

    const user = await User.findById(decoded._id).select("-password -refreshToken")
    if (!user) {
        throw new ApiError(401, "Invalid access token")
    }

    req.user = user
    next()
})
