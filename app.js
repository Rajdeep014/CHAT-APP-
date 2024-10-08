import { v2 as cloudinary } from "cloudinary";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
// import express from "express";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import { coreConfig } from "./constants/config.js";
import {
  CHAT_EXITED,
  CHAT_JOINED,
  NEW_MESSAGE,
  NEW_MESSAGE_ALERT,
  ONLINE_USERS,
  START_TYPING,
  STOP_TYPING,
} from "./constants/events.js";
import { getSockets } from "./lib/helper.js";
import { socketAuthenticator } from "./middlewares/auth.js";
import { errorMiddleware } from "./middlewares/error.js";
import { Message } from "./models/message.js";
import adminRoutes from "./routes/admin.js";
import chatRoutes from "./routes/chat.js";
import userRoutes from "./routes/user.js";
import { connectDb } from "./utils/features.js";

dotenv.config({ path: "./.env" });

const MONGO_DB = process.env.MONGO_URI;
const port = process.env.PORT || 3000;
const envMode = process.env.NODE_ENV.trim() || "PRODUCTION";
const adminSecretKey = process.env.ADMIN_SECRET_KEY || "kya be harami";

// Connect to the database
connectDb(MONGO_DB);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET_KEY,
});

// Create Express application
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:4173",
      process.env.CLIENT_URL,
    ], // Replace with your frontend URL
    credentials: true,
  },
});
app.set("io", io);

const userSocketIDs = new Map();
const onlineUsers = new Set();

// Middleware setup
app.use(express.json());
app.use(cookieParser());
app.use(cors(coreConfig));

// Test endpoint
app.get("/", (req, res) => {
  res.send("hello dosto");
});

// Use the user routes
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/admin", adminRoutes);

// Socket.io middleware for authentication
io.use((socket, next) => {
  cookieParser()(socket.request, socket.request.res, async (err) => {
    if (err) return next(err);
    await socketAuthenticator(err, socket, next);
  });
});

// Socket.io connection event
io.on("connection", (socket) => {
  const user = socket.user;
  // console.log("User connected:", user._id);
  userSocketIDs.set(user._id.toString(), socket.id);
  // console.log("User Socket IDs:", userSocketIDs);

  // Handle new message event
  socket.on(NEW_MESSAGE, async ({ chatId, members, message }) => {
    // console.log("Received new message event:", { chatId, members, message });

    const messageForRealTime = {
      content: message,
      _id: uuid(),
      sender: {
        _id: user._id,
        name: user.name,
      },
      chat: chatId,
      createdAt: new Date().toISOString(),
    };

    const messageForDb = {
      content: message,
      sender: user._id,
      chat: chatId,
    };

    const membersSockets = getSockets(members);
    // console.log("Members' sockets to emit to:", membersSockets);

    // Emit message to members
    io.to(membersSockets).emit(NEW_MESSAGE, {
      chatId,
      message: messageForRealTime,
    });

    // Emit alert to members
    io.to(membersSockets).emit(NEW_MESSAGE_ALERT, {
      chatId,
    });

    // Save the message to the database
    try {
      await Message.create(messageForDb);
    } catch (error) {
      console.error("Error saving message to the database:", error);
      throw new Error(error);
    }
  });

  // Handle typing events
  socket.on(START_TYPING, ({ members, chatId }) => {
    const membersSockets = getSockets(members);

    socket.to(membersSockets).emit(START_TYPING, { chatId });
  });

  socket.on(STOP_TYPING, ({ members, chatId }) => {
    const membersSockets = getSockets(members);

    socket.to(membersSockets).emit(STOP_TYPING, { chatId });
  });
  socket.on(CHAT_JOINED, ({ userId, members }) => {
    onlineUsers.add(userId.toString());

    const membersSocket = getSockets(members);
    io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
  });

  socket.on(CHAT_EXITED, ({ userId, members }) => {
    onlineUsers.delete(userId.toString());

    const membersSocket = getSockets(members);
    io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
  });
  // Handle disconnection
  socket.on("disconnect", () => {
    userSocketIDs.delete(user._id.toString());
    onlineUsers.delete(user._id.toString());
    socket.broadcast.emit(ONLINE_USERS, Array.from(onlineUsers));
  });
});

// Error handling middleware
app.use(errorMiddleware);

// Start the server
server.listen(port, () => {
  console.log(`Server is running on port ${port} in ${envMode}`);
});
export { adminSecretKey, envMode, userSocketIDs };

