import express from "express";
import {
  acceptRequest,
  getAllNotifications,
  getMyFriends,
  getMyProfile,
  login,
  logout,
  newUser,
  searchUser,
  sendRequest,
} from "../controllers/user.js";
import {
  loginValidator,
  registerValidator,
  validateHandle,
} from "../lib/validators.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { singleAvatar } from "../middlewares/multer.js";

const router = express.Router();

router.post("/new", singleAvatar, registerValidator(), validateHandle, newUser);
router.post("/login", loginValidator(), validateHandle, login);
//after this user must have authentication
router.use(isAuthenticated);
router.get("/me", getMyProfile);
router.get("/logout", logout);
router.get("/search", searchUser);
router.put("/sendrequest", sendRequest);
router.get("/notification", getAllNotifications);
router.put("/acceptrequest", acceptRequest);
router.get("/friends", getMyFriends);

export default router;
