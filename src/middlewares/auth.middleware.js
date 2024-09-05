import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/apiError.js";

const verifyJWT = asyncHandler(async (req, _, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
      throw new ApiError(401, "Unautorized token");
    }

    const decodeToken = await jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET
    );

    const user = await User.findById(decodeToken?._id).select(
      "-passward, -refreshToken"
    );

    if (!user) {
      throw new ApiError("Invalid Access Token");
    }

    req.user = user;
    next();
  } catch (error) {
    throw new ApiError(401, error?.message || "Unauthozised Access Token");
  }
});

export { verifyJWT };
