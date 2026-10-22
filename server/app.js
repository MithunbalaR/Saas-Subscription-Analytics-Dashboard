import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { AVATAR_DIR, CLIENT_DIST } from "./config/paths.js";
import openapi from "./docs/openapi.js";
import authRoutes from "./routes/authRoutes.js";
import workspaceRoutes from "./routes/workspaceRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import { activityRoutes, aiRoutes, pushRoutes, reportRoutes, splitRoutes } from "./routes/featureRoutes.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { notFound, errorHandler } from "./middleware/error.js";

const app = express();

app.set("trust proxy", 1); // behind Render's proxy: use the real client IP for rate limiting

// Interactive API documentation (mounted before helmet so its CSP doesn't block the Swagger UI).
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: "SubTrack API" }));

// Security headers. The CSP allows only our own scripts plus Google sign-in, and images from
// Google's favicon service (subscription logos) and Google profile pictures.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }, // Google sign-in popup
    contentSecurityPolicy: {
      directives: {
        "script-src": ["'self'", "https://accounts.google.com/gsi/client"],
        "frame-src": ["'self'", "https://accounts.google.com/gsi/"],
        "connect-src": ["'self'", "https://accounts.google.com/gsi/"],
        "style-src": ["'self'", "'unsafe-inline'", "https://accounts.google.com/gsi/style"],
        "img-src": ["'self'", "data:", "blob:", "https://www.google.com", "https://*.gstatic.com", "https://*.googleusercontent.com"],
        "worker-src": ["'self'", "blob:"],
      },
    },
  })
);
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/uploads/avatars", express.static(AVATAR_DIR, { maxAge: "7d" }));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api", apiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/splits", splitRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api", notFound);

// In production the Express server also serves the built React app (one URL for everything).
if (process.env.NODE_ENV === "production") {
  app.use(express.static(CLIENT_DIST));
  app.get("/{*path}", (req, res) => res.sendFile(path.join(CLIENT_DIST, "index.html")));
}

app.use(notFound);
app.use(errorHandler);

export default app;
