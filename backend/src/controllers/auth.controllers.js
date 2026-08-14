import asyncHandler from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import ApiResponse from "../utils/ApiResponse.js"
import User from "../models/user.model.js"

const cookieOptions = {
    httpOnly: true,
    secure: false,       // set true in production (HTTPS)
    sameSite: "lax",
    path: "/"
}

const registerUser = asyncHandler(async (req, res) => {
    const { username, email, password } = req.body

    if ([username, email, password].some(f => !f?.trim())) {
        throw new ApiError(400, "All fields are required")
    }

    const existing = await User.findOne({ $or: [{ username }, { email }] })
    if (existing) {
        throw new ApiError(409, "User with same username or email already exists")
    }

    const user = await User.create({ username: username.toLowerCase(), email, password })

    const accessToken = user.generateAccessToken()
    const refreshToken = user.generateRefreshToken()

    user.refreshToken = refreshToken
    await user.save({ validateBeforeSave: false })

    return res
        .status(201)
        .cookie("AccessToken", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 })
        .cookie("RefreshToken", refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 })
        .json(new ApiResponse(201, { user: { username: user.username, email: user.email } }, "User registered successfully"))
})

const loginUser = asyncHandler(async (req, res) => {
    const { identifier, password } = req.body

    if (!identifier?.trim() || !password) {
        throw new ApiError(400, "All fields are required")
    }

    const user = await User.findOne({
        $or: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }]
    })

    if (!user) throw new ApiError(404, "User does not exist")

    const isValid = await user.isPasswordCorrect(password)
    if (!isValid) throw new ApiError(401, "Password is incorrect")

    const accessToken = user.generateAccessToken()
    const refreshToken = user.generateRefreshToken()

    user.refreshToken = refreshToken
    await user.save({ validateBeforeSave: false })

    return res
        .status(200)
        .cookie("AccessToken", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 })
        .cookie("RefreshToken", refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 })
        .json(new ApiResponse(200, { user: { username: user.username, email: user.email } }, "User logged in successfully"))
})

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, { $set: { refreshToken: undefined } })

    return res
        .status(200)
        .clearCookie("AccessToken", cookieOptions)
        .clearCookie("RefreshToken", cookieOptions)
        .json(new ApiResponse(200, {}, "User logged out successfully"))
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incoming = req.cookies?.RefreshToken
    if (!incoming) throw new ApiError(401, "Unauthorized request")

    const decoded = jwt.verify(incoming, process.env.REFRESH_TOKEN_SECRET)
    const user = await User.findById(decoded._id)

    if (!user || user.refreshToken !== incoming) {
        throw new ApiError(401, "Invalid or expired refresh token")
    }

    const accessToken = user.generateAccessToken()
    const refreshToken = user.generateRefreshToken()
    user.refreshToken = refreshToken
    await user.save({ validateBeforeSave: false })

    return res
        .status(200)
        .cookie("AccessToken", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 })
        .cookie("RefreshToken", refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 })
        .json(new ApiResponse(200, { user: { username: user.username, email: user.email } }, "Access token refreshed"))
})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, { user: { username: req.user.username, email: req.user.email } }, "Current user"))
})

export { registerUser, loginUser, logoutUser, refreshAccessToken, getCurrentUser }
