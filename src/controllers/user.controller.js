import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken"

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating AccessToken or RefreshToken "
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, userName, password, email } = req.body;

  // get user details from frontend
  // validation not empty
  // check if user already exists: username, email // check for images, check for avatar
  // upload them to cloudinary, avatar
  // create user object - create entry in db
  // remove password and refresh token field from response
  // check for user creation
  // return res

  if (
    [fullName, userName, password, email]?.some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const emailAnduserNameExist = await User.findOne({
    $or: [{ email }, { userName }],
  });

  if (emailAnduserNameExist) {
    throw new ApiError(409, "User with email or userName already exists");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;
  let coverImageLocalPath;

  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  const user = await User.create({
    fullName,
    userName: userName.toLowerCase(),
    email,
    password,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User register successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  // req body -> data // username or email
  //find the user
  //password check
  //access and referesh token
  //send cookie

  const { userName, email, password } = req.body;

  if ( !(userName || email)) {
    throw new ApiError("Email or user name is required");
  }

  const user = await User.findOne({
    $or: [{ userName }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  const isPasswordValid = user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid User credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  const loginUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const option = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, option)
    .cookie("refreshToken", refreshToken, option)
    .json(
      new ApiResponse(
        200,
        {
          user: loginUser,
          accessToken,
          refreshToken,
        },
        "User Logged In Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { refreshToken: undefined },
    },
    {
      new: true,
    }
  );

const option = {
  httpOnly: true,
  secure: true, 
}

return res
.status(200)
.clearCookie("accessToken", option)
.clearCookie("refreshToken", option)
.json(new ApiResponse(200, {}, "Logout User Successfully"))
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  try {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
     if(!incomingRefreshToken) {
      throw new ApiError(401, "Refresh Token is required")
    }
  
    const decodedToken = await jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
  
    if(!decodedToken) {
      throw new ApiError(401, "Invalid Refresh Token")
    }
  
    const user = await User.findById(decodedToken?._id)
  
    if(!user) {
      throw new ApiError(401, "User does not exist")
    }
  
    if(user.refreshToken !== incomingRefreshToken) {
      throw new ApiError(401, "Invalid Refresh Token or expired")
    }
  
    const option = {
      httpOnly: true,
      secure: true,
    }
  
    const {accessToken, newRefreshToken} = await generateAccessAndRefreshToken(decodedToken?._id)
  
    return res
    .status(200)
    .cookie("accessToken", accessToken, option)
    .cookie("refreshToken", newRefreshToken, option)
    .json(new ApiResponse(200, { accessToken, refreshToken: newRefreshToken}, "Refresh Access Token Successfully"))
  } catch (error) {
    throw new ApiError(401, "Invalid Refresh Token")
  }

})
  

export { registerUser, loginUser, logoutUser, refreshAccessToken };
