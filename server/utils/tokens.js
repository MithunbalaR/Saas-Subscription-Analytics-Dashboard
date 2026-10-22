import jwt from "jsonwebtoken";

const REFRESH_COOKIE = "refreshToken";
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const refreshSecret = () => process.env.JWT_REFRESH_SECRET || `${process.env.JWT_SECRET}-refresh`;

// Short-lived access token (sent in the Authorization header, kept in memory on the client).
export const signAccessToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m" });

export const verifyRefreshToken = (token) => jwt.verify(token, refreshSecret());

// Long-lived refresh token in an httpOnly cookie - JavaScript can't read it, which protects it from XSS.
// `v` is the user's tokenVersion: bumping it (password change/reset) invalidates every old refresh token.
export const setRefreshCookie = (res, user) => {
  const token = jwt.sign({ id: user._id, v: user.tokenVersion }, refreshSecret(), { expiresIn: "7d" });
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_MAX_AGE,
  });
};

export const clearRefreshCookie = (res) => res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });

export const readRefreshCookie = (req) => req.cookies?.[REFRESH_COOKIE];

// Log the user in: set the refresh cookie and return the JSON body with the access token.
export const issueSession = (res, user) => {
  setRefreshCookie(res, user);
  return { accessToken: signAccessToken(user), user };
};
