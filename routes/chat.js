import express from "express";
import {
  addMembers,
  deleteChat,
  getChatDetails,
  getMessages,
  getMyChats,
  getMyGroups,
  leaveGroup,
  newGroupChat,
  removeMembers,
  renameGroup,
  sendAttachments,
} from "../controllers/chat.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { attachmentMulter } from "../middlewares/multer.js";

const router = express.Router();

//after this user must have authentication
router.use(isAuthenticated);
router.post("/new", newGroupChat);
router.get("/my", getMyChats);
router.get("/my/groups", getMyGroups);
router.put("/addmembers", addMembers);
router.put("/removemembers", removeMembers);
router.delete("/leave/:id", leaveGroup);
router.post("/message", attachmentMulter, sendAttachments);
router.get("/message/:id", getMessages);
router.route("/:id").get(getChatDetails).put(renameGroup).delete(deleteChat);

export default router;
