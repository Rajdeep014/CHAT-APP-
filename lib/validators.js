import { body, validationResult } from "express-validator";
import { ErrorHandler } from "../utils/utility.js";

//todo have to create validators for chats
const registerValidator = () => [
  body("name", "please Enter Your Name").notEmpty(),
  body("username", "please Enter Your username").notEmpty(),
  body("password", "please Enter Your password").notEmpty(),
  body("bio", "please Enter Your bio").notEmpty(),
];
const loginValidator = () => [
  body("username", "please Enter Your username").notEmpty(),
  body("password", "please Enter Your password").notEmpty(),
];
const validateHandle = (req, res, next) => {
  const errors = validationResult(req);
  const errorMessages = errors
    .array()
    .map((error) => error.msg)
    .join(",");

  if (errors.isEmpty) return next();
  else next(new ErrorHandler(errorMessages, 400));
};

export { loginValidator, registerValidator, validateHandle };
