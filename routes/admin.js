import express from "express";
import {
  adminLogin,
  adminLogout,
  allChats,
  allMessages,
  allUsers,
  getAdminData,
  getDashboardStats,
} from "../controllers/admin.js";
import { adminOnly } from "../middlewares/auth.js";

const router = express.Router();
router.post("/verify", adminLogin);
router.get("/logout", adminLogout);

router.use(adminOnly);

router.get("/", getAdminData);
router.get("/user", allUsers);
router.get("/chat", allChats);
router.get("/message", allMessages);
router.get("/dashboard", getDashboardStats);

export default router;
