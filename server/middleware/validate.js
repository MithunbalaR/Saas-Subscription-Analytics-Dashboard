import { validationResult } from "express-validator";
import { httpError } from "../utils/helpers.js";

// Runs express-validator rules, then rejects the request with 400 and readable messages if any fail.
export const validate = (rules) => [
  ...rules,
  (req, res, next) => {
    const result = validationResult(req);
    if (result.isEmpty()) return next();
    const messages = [...new Set(result.array().map((e) => e.msg))];
    throw httpError(400, messages.join(", "));
  },
];
