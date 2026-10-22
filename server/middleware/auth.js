import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { httpError } from "../utils/helpers.js";

// Verifies the "Authorization: Bearer <access token>" header and attaches the user to req.
export const protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw httpError(401, "Not authorized, no token");

  let decoded;
  try {
    decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
  } catch {
    throw httpError(401, "Not authorized, invalid or expired token");
  }

  const user = await User.findById(decoded.id);
  if (!user) throw httpError(401, "User no longer exists");

  req.user = user;
  next();
};

// Role-based access control: only admins may continue.
export const adminOnly = (req, res, next) => {
  if (req.user?.role !== "admin") throw httpError(403, "Admin access required");
  next();
};
