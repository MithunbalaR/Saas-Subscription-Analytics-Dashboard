import "dotenv/config";
import http from "node:http";
import app from "./app.js";
import connectDB from "./config/db.js";
import { initRealtime } from "./utils/realtime.js";
import { startReminderJob } from "./jobs/reminders.js";
import { startMonthlyReportJob } from "./jobs/monthlyReport.js";
import { whatsappProvider } from "./utils/whatsapp.js";

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

// One HTTP server shared by Express (REST API) and Socket.io (real-time events).
const server = http.createServer(app);
initRealtime(server);

connectDB()
  .then(() => {
    server.listen(PORT, () => console.log(`API running on http://localhost:${PORT} (docs: /api/docs)`));
    startReminderJob();
    startMonthlyReportJob();
    // Users' own WhatsApp accounts, linked by QR code in Settings.
    if (whatsappProvider() === "web") import("./utils/whatsappWeb.js").then(({ restoreSessions }) => restoreSessions());
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
