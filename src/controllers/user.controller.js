import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";

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

  // 1. get user details from frontend
  // 2. validation not empty
  // 3. check if user already exists: username, email // check for images, check for avatar
  // 4. upload them to cloudinary, avatar
  // 5. create user object - create entry in db
  // 6. remove password and refresh token field from response
  // 7. check for user creation
  // 8. return res

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
    coverImageLocalPath = req.files?.coverImage[0].path;
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
  // 1. req body -> data // username or email
  // 2. find the user
  // 3. password check
  // 4. access and referesh token
  // 5. send cookie

  const { userName, email, password } = req.body;

  if (!(userName || email)) {
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
    req.user?._id,
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
  };

  return res
    .status(200)
    .clearCookie("accessToken", option)
    .clearCookie("refreshToken", option)
    .json(new ApiResponse(200, {}, "Logout User Successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  try {
    const incomingRefreshToken =
      req.cookies?.refreshToken || req.body?.refreshToken;
    if (!incomingRefreshToken) {
      throw new ApiError(401, "Refresh Token is required");
    }

    const decodedToken = await jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    if (!decodedToken) {
      throw new ApiError(401, "Invalid Refresh Token");
    }

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "User does not exist");
    }

    if (user.refreshToken !== incomingRefreshToken) {
      throw new ApiError(401, "Invalid Refresh Token or expired");
    }

    const option = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshToken(decodedToken?._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, option)
      .cookie("refreshToken", newRefreshToken, option)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Refresh Access Token Successfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, "Invalid Refresh Token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword && !newPassword) {
      throw new ApiError(400, "Current Password and New Password are required");
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      throw new ApiError(400, "User does not exist");
    }

    const isPasswordValid = await user.isPasswordCorrect(oldPassword);

    if (!isPasswordValid) {
      throw new ApiError(400, "Invalid Old Password");
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Password Changed Successfully"));
  } catch (error) {
    throw new ApiError(
      400,
      error.message || "Something went wrong while changing old Password"
    );
  }
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(
      new ApiResponse(200, { user: req.user }, "Get Current User Successfully")
    );
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  try {
    const { fullName, email } = req.body;

    if (!fullName || !email) {
      throw new ApiError(400, "Full Name Or Email are required");
    }

    const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
        $set: { fullName, email },
      },
      { new: true }
    ).select("-password");

    return res
      .status(200)
      .json(
        new ApiResponse(200, { user }, "Account Detail Changed Successfully")
      );
  } catch (error) {
    throw new ApiError(
      400,
      error.message || "Something went wrong while changing Account Detail"
    );
  }
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  try {
    const avartarLocalPath = req.file.path;
    if (!avartarLocalPath) {
      throw new ApiError(400, "Avatar is required");
    }

    const avatar = await uploadOnCloudinary(avartarLocalPath);

    if (!avatar) {
      throw new ApiError(400, "Something went wrong while uploading avatar");
    }

    const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
        $set: { avatar: avatar?.url },
      },
      { new: true }
    ).select("-password");

    return res
      .status(200)
      .json(new ApiResponse(200, { user }, "Avatar Changed Successfully"));
  } catch (error) {
    throw new ApiError(
      400,
      error.message || "Something went wrong while changing avatar"
    );
  }
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  try {
    const coverImageLocalPath = req.file.path;
    if (!coverImageLocalPath) {
      throw new ApiError(400, "Cover Image is required");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!coverImage) {
      throw new ApiError(
        400,
        "Something went wrong while uploading Cover Image"
      );
    }

    const user = await User.findOneAndUpdate(
      req.user?._id,
      {
        $set: {
          coverImage: coverImage?.url,
        },
      },
      { new: true }
    ).select("-password");

    return res
      .status(200)
      .json(new ApiResponse(200, { user }, "Cover Image Changed Successfully"));
  } catch (error) {
    throw new ApiError(400, "Something went wrong while changing Cover Image");
  }
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
};
