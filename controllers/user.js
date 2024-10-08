import { compare } from "bcrypt";
import { NEW_REQUEST, REFETCH_CHATS } from "../constants/events.js";
import { getOtherMember } from "../lib/helper.js";
import { TryCatch } from "../middlewares/error.js";
import { Chat } from "../models/chat.js";
import { Request } from "../models/request.js";
import { User } from "../models/user.js";
import {
  cookieOption,
  emitEvent,
  sendToken,
  uploadFilesToCloudinary,
} from "../utils/features.js";
import { ErrorHandler } from "../utils/utility.js";

export const newUser = TryCatch(async (req, res, next) => {
  const { name, username, password, bio } = req.body;
  const file = req.file; // multer will have populated this
  if (!file) return next(new ErrorHandler("no file available", 400));

  // Call the upload function, passing the file directly
  const result = await uploadFilesToCloudinary([file]);

  // Ensure the result is valid
  if (!result || result.length === 0) {
    return next(new ErrorHandler("File upload failed", 500));
  }

  const avatar = {
    public_id: result[0].public_id,
    url: result[0].url,
  };

  const user = await User.create({
    name,
    username,
    password,
    bio,
    avatar,
  });

  sendToken(res, user, 201, "User created");
});

export const login = TryCatch(async (req, res, next) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username }).select("+password");
  if (!user) return next(new ErrorHandler("Invalid Username or password", 404));
  const isMatch = await compare(password, user.password);

  if (!isMatch)
    return next(new ErrorHandler("Invalid username or password", 404));
  sendToken(res, user, 201, `Welcome Back ${user.name} `);
});

export const getMyProfile = TryCatch(async (req, res, next) => {
  const user = await User.findById(req.user);
  res.status(200).json({ success: true, user });
});
export const logout = TryCatch(async (req, res, next) => {
  return res
    .status(200)
    .cookie("chattu-token", "", { ...cookieOption, maxAge: 0 })
    .json({
      success: true,
      message: "Logout Successfullly",
    });
});
export const searchUser = TryCatch(async (req, res, next) => {
  const { name = "" } = req.query;
  const myChats = await Chat.find({ groupChat: false, members: req.user });
  const allUsersFromMyChats = myChats.flatMap((chat) => chat.members);

  const allUsersExceptMeAndFriends = await User.find({
    _id: { $nin: allUsersFromMyChats },
    name: { $regex: name, $options: "i" },
  });

  const users = allUsersExceptMeAndFriends.map(({ _id, name, avatar }) => ({
    _id,
    name,
    avatar: avatar.url,
  }));
  return res.status(200).json({
    success: true,
    message: "Fetch Successfullly",
    users,
  });
});
export const sendRequest = TryCatch(async (req, res, next) => {
  const { userId } = req.body;
  const request = await Request.findOne({
    $or: [
      { sender: req.user, receiver: userId },
      { sender: userId, receiver: req.user },
    ],
  });

  if (request) return next(new ErrorHandler("Req Already have", 404));
  await Request.create({ sender: req.user, receiver: userId });
  emitEvent(req, NEW_REQUEST, [userId]);

  return res.status(200).json({
    success: true,
    message: "Friend Request Sent",
  });
});
export const acceptRequest = TryCatch(async (req, res, next) => {
  const { requestId, accept } = req.body;

  // Find the request and populate sender and receiver details
  const request = await Request.findById(requestId)
    .populate("sender", "name")
    .populate("receiver", "name");

  // Check if the request exists
  if (!request) {
    return next(new ErrorHandler("No request found", 404));
  }

  // Check if the request's receiver is populated and ensure it matches the current user
  if (request.receiver?._id?.toString() !== req.user.toString()) {
    return next(new ErrorHandler("Unauthorized access to request", 403));
  }

  // If the request is denied
  if (!accept) {
    await request.deleteOne();
    return res.status(200).json({
      success: true,
      message: "Friend request denied",
    });
  }

  // If the request is accepted
  const members = [request.sender._id, request.receiver._id];

  await Promise.all([
    Chat.create({
      members,
      name: `${request.sender.name}-${request.receiver.name}`,
    }),
    request.deleteOne(),
  ]);

  // Emit event to notify about chat refresh (if applicable)
  emitEvent(req, REFETCH_CHATS, members);

  return res.status(200).json({
    success: true,
    message: "Friend request accepted",
    senderId: request.sender._id,
  });
});

export const getAllNotifications = TryCatch(async (req, res, next) => {
  const requests = await Request.find({ receiver: req.user }).populate(
    "sender",
    "name avatar"
  );

  const allRequest = requests.map(({ _id, sender }) => ({
    _id,
    sender: {
      _id: sender._id,
      name: sender.name,
      avatar: sender.avatar?.url || "", // Safely accessing avatar URL
    },
  }));

  return res.status(200).json({
    success: true,
    allRequest,
  });
});

export const getMyFriends = TryCatch(async (req, res, next) => {
  const chatId = req.query.chatId;

  // Find all chats the user is part of, excluding group chats
  const chats = await Chat.find({
    members: req.user,
    groupChat: false,
  }).populate("members", "name avatar");

  // Map through the chats to find friends
  const friends = chats
    .map(({ members }) => {
      const OtherUser = getOtherMember(members, req.user);

      if (!OtherUser) {
        console.error("No other member found in chat", members);
        return null; // Return null if no other user is found
      }

      return {
        _id: OtherUser._id,
        name: OtherUser.name,
        avatar: OtherUser.avatar?.url || "", // Safely access avatar URL
      };
    })
    .filter((friend) => friend !== null); // Filter out null values

  // If a chatId is provided, filter out members already in the chat
  if (chatId) {
    const chat = await Chat.findById(chatId);

    // Check if the chat exists
    if (!chat) {
      return next(new ErrorHandler("Chat not found", 404));
    }

    const availableFriends = friends.filter(
      (friend) =>
        !chat.members.some(
          (member) => member.toString() === friend._id.toString()
        )
    );

    return res.status(200).json({
      success: true,
      friends: availableFriends,
    });
  }

  // Return all friends if no chatId is provided
  return res.status(200).json({
    success: true,
    friends,
  });
});
