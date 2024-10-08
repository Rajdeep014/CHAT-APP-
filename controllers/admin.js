import jwt from "jsonwebtoken";
import { adminSecretKey } from "../app.js";
import { TryCatch } from "../middlewares/error.js";
import { Chat } from "../models/chat.js";
import { Message } from "../models/message.js";
import { User } from "../models/user.js";
import { cookieOption } from "../utils/features.js";
import { ErrorHandler } from "../utils/utility.js";

export const adminLogin = TryCatch(async (req, res, next) => {
  const { secretKey } = req.body;

  const isMatched = secretKey === adminSecretKey;
  if (!isMatched)
    return next(
      new ErrorHandler("Galat Password Sir....bhulakkar noode ", 401)
    );

  // Sign the token using the correct secret key from environment variables
  const token = jwt.sign(secretKey, process.env.JWT_SECRET);

  return res
    .status(200)
    .cookie("taniya-token", token, {
      ...cookieOption,
      maxAge: 1000 * 60 * 15, // 15 minutes
    })
    .json({
      success: true,
      message: "Authenticated Successfully, Welcome BOSS",
    });
});
export const adminLogout = TryCatch(async (req, res, next) => {
  return res
    .status(200)
    .cookie("taniya-token", "", {
      ...cookieOption,
      maxAge: 0,
    })
    .json({
      success: true,
      message: "MERA BOSSS GYA BSDK logout successfully done",
    });
});

export const getAdminData = TryCatch(async (req, res, next) => {
  res.json({
    Admin: true,
  });
});
export const allUsers = TryCatch(async (req, res, next) => {
  const users = await User.find({});

  // Use Promise.all to handle the array of promises correctly
  const transformUser = await Promise.all(
    users.map(async ({ name, username, _id, avatar }) => {
      const [groups, friends] = await Promise.all([
        Chat.countDocuments({ groupChat: true, members: _id }),
        Chat.countDocuments({ groupChat: false, members: _id }),
      ]);
      return {
        name,
        username,
        avatar: avatar.url, // Ensure that avatar is defined
        _id,
        groups,
        friends,
      };
    })
  );

  return res.status(200).json({
    success: true,
    message: "KYA BE",
    users: transformUser,
  });
});
export const allChats = TryCatch(async (req, res, next) => {
  const chats = await Chat.find({})
    .populate("members", "name avatar") // Populate name and avatar for members
    .populate("creator", "name avatar"); // Populate creator's name and avatar

  // Use Promise.all to ensure all asynchronous operations are awaited
  const transformChat = await Promise.all(
    chats.map(async ({ members, _id, groupChat, name, creator }) => {
      const totalMessages = await Message.countDocuments({ chat: _id });

      return {
        _id,
        groupChat,
        name,
        avatar: members.slice(0, 3).map((member) => member.avatar?.url || ""), // Safely access avatar
        members: members.map((member) => {
          return {
            _id: member._id,
            name: member.name,
            avatar: member.avatar?.url || "", // Safely access avatar
          };
        }),
        creator: {
          name: creator?.name || "Unknown", // Handle missing creator data
          avatar: creator?.avatar?.url || "", // Safely access creator's avatar
        },
        totalMembers: members.length, // Correct typo (lenght -> length)
        totalMessages,
      };
    })
  );

  return res.status(200).json({
    success: true,
    chats: transformChat,
  });
});

export const allMessages = TryCatch(async (req, res, next) => {
  const messages = await Message.find({})
    .populate("sender", "name avatar")
    .populate("chat", "groupChat");

  const transformMessages = messages.map(
    ({ content, attachments, _id, sender, createdAt, chat }) => {
      return {
        _id,
        attachments,
        content,
        createdAt,
        chat: chat._id,
        groupChat: chat.groupChat,
        sender: {
          _id: sender._id,
          name: sender.name,
          avatar: sender.avatar?.url || "", // Safe access to avatar URL
        },
      };
    }
  );

  return res.status(200).json({
    success: true,
    messages: transformMessages,
  });
});
export const getDashboardStats = TryCatch(async (req, res, next) => {
  const [groupsCount, usersCount, messageCount, totalChatCount] =
    await Promise.all([
      Chat.countDocuments({ groupChat: true }),
      User.countDocuments(),
      Message.countDocuments(),
      Chat.countDocuments(),
    ]);

  const today = new Date();
  const last7days = new Date();
  last7days.setDate(last7days.getDate() - 7);

  const last7daysMessages = await Message.find({
    createdAt: {
      $gte: last7days,
      $lte: today,
    },
  }).select("createdAt");

  const messages = new Array(7).fill(0);
  const dayInMilliseconds = 1000 * 60 * 60 * 24;

  last7daysMessages.forEach((message) => {
    const indexApprox =
      (today.getTime() - new Date(message.createdAt).getTime()) /
      dayInMilliseconds;
    const index = Math.floor(indexApprox);
    if (index >= 0 && index < 7) {
      messages[6 - index]++;
    }
  });

  const stats = {
    groupsCount,
    usersCount,
    messageCount,
    totalChatCount,
    messages, // Include the message count for the last 7 days
  };

  return res.status(200).json({
    success: true,
    stats,
  });
});
