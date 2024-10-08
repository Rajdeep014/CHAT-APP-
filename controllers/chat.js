import { TryCatch } from "..//middlewares/error.js";
import {
  ALERT,
  NEW_MESSAGE,
  NEW_MESSAGE_ALERT,
  REFETCH_CHATS,
} from "../constants/events.js";
import { getOtherMember } from "../lib/helper.js";
import { Chat } from "../models/chat.js";
import { Message } from "../models/message.js";
import { User } from "../models/user.js";
import {
  deletFilesFromCloudinary,
  emitEvent,
  uploadFilesToCloudinary,
} from "../utils/features.js";
import { ErrorHandler } from "../utils/utility.js";

export const newGroupChat = TryCatch(async (req, res, next) => {
  const { name, members } = req.body;
  if (members.length < 2)
    return next(
      new ErrorHandler("Group chat must have at least 2 member", 404)
    );
  const allMembers = [...members, req.user];
  await Chat.create({
    name,
    groupChat: true,
    creator: req.user,
    members: allMembers,
  });
  emitEvent(req, ALERT, allMembers, `Welcome  to ${name} group `);
  emitEvent(req, REFETCH_CHATS, members);
  return res.status(201).json({
    success: true,
    message: "Group chat  created",
  });
});
export const getMyChats = TryCatch(async (req, res, next) => {
  const chats = await Chat.find({ members: req.user }).populate(
    "members",
    "name avatar"
  );

  const transformedChats = chats.map(({ _id, name, groupChat, members }) => {
    const otherMember = getOtherMember(members, req.user);

    // console.log("Other Member:", otherMember); // Log otherMember to inspect it

    return {
      _id,
      groupChat,
      avatar: groupChat
        ? members.slice(0, 3).map(({ avatar }) => avatar?.url)
        : [otherMember?.avatar?.url], // Safely access otherMember and its avatar

      name: groupChat ? name : otherMember?.name, // Safely access otherMember name, fallback to "Unknown"
      members: members.reduce((prev, curr) => {
        if (curr._id.toString() !== req.user.toString()) {
          prev.push(curr.id);
        }
        return prev;
      }, []),
    };
  });

  // console.log("Transformed Chats:", transformedChats); // Log transformed chats

  return res.status(200).json({
    success: true,
    chats: transformedChats,
  });
});

export const getMyGroups = TryCatch(async (req, res, next) => {
  const chats = await Chat.find({
    members: req.user,
    groupChat: true,
    creator: req.user,
  }).populate("members", "name avatar");

  const groups = chats.map(({ members, _id, groupChat, name }) => ({
    _id,
    groupChat,
    name,
    avatar: members.slice(0, 3).map(({ avatar }) => avatar.url),
  }));
  return res.status(200).json({
    status: true,
    chats: groups,
  });
});

export const addMembers = TryCatch(async (req, res, next) => {
  const { chatId, members } = req.body;

  // Fetch the chat, ensure it's awaited
  const chat = await Chat.findById(chatId);
  if (!chat) return next(new ErrorHandler("No chat available", 404));

  if (!members || !members.length)
    return next(new ErrorHandler("Please add members", 400));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 404));

  // Ensure the request is from the group creator
  if (chat.creator.toString() !== req.user.toString())
    return next(
      new ErrorHandler("Only the group creator can add members", 403)
    );

  // Check the current number of members before adding new ones
  if (chat.members.length + members.length > 50)
    return next(new ErrorHandler("Group member limit reached", 400));

  // Fetch all new members' data, handle errors if any member is not found
  const allNewMembersPromise = members.map((i) => User.findById(i, "name"));
  const allNewMembers = await Promise.all(allNewMembersPromise);

  // Check if any of the members were not found
  if (allNewMembers.includes(null)) {
    return next(new ErrorHandler("One or more users not found", 404));
  }
  const uniqueMembers = allNewMembers
    .filter((i) => !chat.members.includes(i._id.toString()))
    .map((i) => i._id);

  // Add the new members to the chat (extract _id from each new member)
  chat.members.push(...uniqueMembers);

  // Save the updated chat with the new members
  await chat.save();

  // Notify users that new members were added
  const allUsersName = allNewMembers.map((i) => i.name).join(",");
  emitEvent(
    req,
    ALERT,
    chat.members,
    `${allUsersName} has been added to the group`
  );
  emitEvent(req, REFETCH_CHATS, chat.members);

  // Respond with success
  return res.status(200).json({
    status: true,
    message: "Members added successfully",
  });
});

export const removeMembers = TryCatch(async (req, res, next) => {
  const { userId, chatId } = req.body;

  // Find the chat and the user to be removed
  const [chat, userThatWillBeRemoved] = await Promise.all([
    Chat.findById(chatId),
    User.findById(userId, "name"),
  ]);

  // If the chat does not exist
  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  // Check if the chat is a group chat
  if (!chat.groupChat) return next(new ErrorHandler("Not a group chat", 404));

  // Only the group creator can remove members
  if (chat.creator.toString() !== req.user.toString()) {
    return next(
      new ErrorHandler("Only the group creator can remove members", 403)
    );
  }

  // Ensure there are members in the chat
  if (!chat.members || chat.members.length === 0) {
    return next(new ErrorHandler("No members to remove", 400));
  }

  // Ensure the group has more than 3 members before removing someone
  if (chat.members.length <= 3) {
    return next(
      new ErrorHandler("The group must have at least 3 members", 400)
    );
  }

  // Remove the specified user from the group
  const allChatMembers = chat.members.map((i) => i.toString());
  chat.members = chat.members.filter(
    (member) => member.toString() !== userId.toString()
  );

  // Emit events for member removal and refreshing the chat list
  emitEvent(req, ALERT, chat.members, {
    message: `${userThatWillBeRemoved.name} has been removed from the group`,
    chatId,
  });
  emitEvent(req, REFETCH_CHATS, allChatMembers);

  // Save the updated chat document
  await chat.save();

  // Respond with success
  return res.status(200).json({
    status: true,
    message: "Member removed successfully",
  });
});

export const leaveGroup = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;

  // Find the chat by ID
  const chat = await Chat.findById(chatId);
  if (!chat) return next(new ErrorHandler("No chat found", 404));

  // Filter out the user leaving the group
  const remainingMembers = chat.members.filter(
    (member) => member.toString() !== req.user.toString() // Ensure `req.user._id.toString()` is used
  );

  // Ensure the group still has at least 3 members after the user leaves
  if (remainingMembers.length < 3) {
    return next(
      new ErrorHandler("The group must have at least 3 members", 400)
    );
  }

  // If the user leaving is the creator, assign a new random creator
  if (chat.creator.toString() === req.user.toString()) {
    const randomIndex = Math.floor(Math.random() * remainingMembers.length); // Use `Math.random()`
    const newCreator = remainingMembers[randomIndex];
    chat.creator = newCreator;
  }

  // Update the chat members
  chat.members = remainingMembers;

  // Save the chat and fetch the user details
  const [user] = await Promise.all([
    User.findById(req.user, "name"), // Make sure you're fetching the correct user ID
    chat.save(),
  ]);

  // Emit an event about the user leaving the group
  emitEvent(req, ALERT, chat.members, {
    message: F`${user.name} has left the group`,
    chatId,
  });

  // Respond with success
  return res.status(200).json({
    status: true,
    message: "You have left the group successfully",
  });
});
export const sendAttachments = TryCatch(async (req, res, next) => {
  const { chatId } = req.body;
  const files = req.files || [];

  // Validate file attachments
  if (files.length < 1) {
    return next(new ErrorHandler("Please upload attachments", 400));
  }
  if (files.length > 5) {
    return next(new ErrorHandler("Files can't exceed 5", 400));
  }

  const [chat, me] = await Promise.all([
    Chat.findById(chatId),
    User.findById(req.user, "name"),
  ]);

  if (!chat) {
    return next(new ErrorHandler("Chat not found", 404));
  }

  try {
    // Upload files to Cloudinary or another storage service
    const attachments = await uploadFilesToCloudinary(files);

    // Prepare message for database
    const messageForDb = {
      content: "",
      attachments, // Store attachment details
      sender: me._id,
      chat: chatId,
    };

    // Prepare real-time message structure
    const messageForRealtime = {
      ...messageForDb,
      sender: { _id: me._id, name: me.name },
    };

    // Create message in the database
    const message = await Message.create(messageForDb);

    // Emit events to update real-time

    emitEvent(
      req,
      NEW_MESSAGE,
      chat.members, // Send to all chat members
      { message: messageForRealtime },
      chatId
    );
    emitEvent(req, NEW_MESSAGE_ALERT, chat.message, { chatId });

    return res.status(200).json({
      success: true,
      message,
    });
  } catch (error) {
    // Log error for debugging and return error response
    // console.error("Error uploading attachments: ", error);
    return next(new ErrorHandler("Failed to upload attachments", 500));
  }
});

export const getChatDetails = TryCatch(async (req, res, next) => {
  if (req.query.populate === "true") {
    const chat = await Chat.findById(req.params.id)
      .populate("members", "name avatar")
      .lean();
    chat.members = chat.members.map(({ _id, name, avatar }) => ({
      _id,
      name,
      avatar: avatar.url,
    }));

    if (!chat) return next(new ErrorHandler("No Chat is found ", 404));
    return res.status(200).json({
      success: true,
      chat,
    });
  } else {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return next(new ErrorHandler("No Chat is found ", 404));
    return res.status(200).json({
      success: true,
      chat,
    });
  }
});
export const renameGroup = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;
  const { name } = req.body;
  const chat = await Chat.findById(chatId);
  if (!chat) return next(new ErrorHandler("No chat found", 404));
  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat ", 404));
  if (chat.creator.toString() !== req.user.toString())
    return next(new ErrorHandler("tu kon hai bsdk", 403));
  chat.name = name;
  await chat.save();
  emitEvent(req, REFETCH_CHATS, chat.members);

  return res.status(200).json({
    success: true,
    message: "Group renamed Successfully",
  });
});
export const deleteChat = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;

  const chat = await Chat.findById(chatId);
  if (!chat) return next(new ErrorHandler("No chat found", 404));
  const members = chat.members;
  if (chat.groupChat && chat.creator.toString() !== req.user.toString())
    return next(new ErrorHandler("you are not allowed to delete a group", 403));

  const messageWithAttachments = await Message.find({
    chat: chatId,
    attachements: { $exists: true, $ne: [] },
  });
  const public_ids = [];
  messageWithAttachments.forEach(({ attachements }) =>
    attachements.forEach(({ public_ids }) => public_ids.push(public_ids))
  );
  await Promise.all([
    deletFilesFromCloudinary(public_ids),
    chat.deleteOne(),
    Message.deleteMany({ chat: chatId }),
  ]);
  emitEvent(req, REFETCH_CHATS, members);
  return res.status(200).json({
    success: true,
    message: "chat deleted successfully",
  });
});
export const getMessages = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;
  const { page = 1 } = req.query;
  const limit = 20;
  const skip = (page - 1) * limit;
  const chat = await Chat.findById(chatId);
  if (!chat) return next(new ErrorHandler("No chat found", 404));
  if (!chat.members.includes(req.user.toString()))
    return next(
      new ErrorHandler("You are not allowed to access this chat", 403)
    );
  const [messages, totalMessagesCount] = await Promise.all([
    Message.find({ chat: chatId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", "name")
      .lean(),
    Message.countDocuments({ chat: chatId }),
  ]);
  const TotalPages = Math.ceil(totalMessagesCount / limit);

  return res.status(200).json({
    success: true,
    message: messages.reverse(),
    TotalPages,
  });
});
