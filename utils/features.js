import { v2 as cloudinary } from "cloudinary";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { v4 as uuid } from "uuid";
import { getSockets } from "../lib/helper.js";
// Database connection
const connectDb = (uri) => {
  mongoose
    .connect(uri, { dbName: "ChatAPP" })
    .then((data) => console.log(`Connected to DB: ${data.connection.host}`))
    .catch((error) => {
      throw error;
    });
};

// Cookie options
const cookieOption = {
  maxAge: 15 * 24 * 60 * 60 * 1000, // 15 days
  sameSite: "none",
  httpOnly: true,
  secure: true,
};

// Send token with cookie and response
const sendToken = (res, user, code, message) => {
  const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
    // Updated to JWT_SECRET
    expiresIn: "15d", // Token expires in 15 days
  });

  // Send the token as a cookie and respond with success
  return res
    .status(code)
    .cookie("chattu-token", token, cookieOption)
    .json({ success: true, message, user, token });
};

const emitEvent = (req, event, users, data) => {
  const io = req.app.get("io");

  const usersSocket = getSockets(users);
  io.to(usersSocket).emit(event, data);
};

const deletFilesFromCloudinary = async (public_ids) => {
  console.log(public_ids);
};

const uploadFilesToCloudinary = async (files = [], useBase64 = false) => {
  const uploadPromises = files.map((file) => {
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        resource_type: "auto",
        public_id: uuid(), // Automatically generates a unique ID
      };

      const uploadCallback = (error, result) => {
        if (error) return reject(error);
        resolve(result);
      };

      if (useBase64) {
        // Convert the file buffer to Base64 and send it to Cloudinary
        const base64Data = `data:${file.mimetype};base64,${file.buffer.toString(
          "base64"
        )}`;
        cloudinary.uploader.upload(base64Data, uploadOptions, uploadCallback);
      } else {
        // Use the buffer directly and send it through the upload stream
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          uploadCallback
        );
        uploadStream.end(file.buffer);
      }
    });
  });

  try {
    const results = await Promise.all(uploadPromises);
    return results.map((result) => ({
      public_id: result.public_id,
      url: result.secure_url,
    }));
  } catch (error) {
    throw new Error("Error uploading files to Cloudinary: " + error.message);
  }
};

export {
  connectDb,
  cookieOption,
  deletFilesFromCloudinary,
  emitEvent,
  sendToken,
  uploadFilesToCloudinary,
};
