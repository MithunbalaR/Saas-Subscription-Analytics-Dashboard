import rateLimit from "express-rate-limit";

const skip = () => process.env.NODE_ENV === "test";

// Slows down password guessing and OTP brute-force attempts.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
  message: { message: "Too many attempts. Please try again in 15 minutes." },
});

// General safety net for the whole API.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
  message: { message: "Too many requests. Please slow down." },
});

// The AI assistant costs money per question, so each user gets a fair-use allowance.
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.AI_REQUESTS_PER_HOUR || 30),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
  keyGenerator: (req) => String(req.user._id),
  message: { message: "You've reached the hourly limit for the AI assistant. Please try again later." },
});
