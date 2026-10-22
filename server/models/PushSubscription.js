import mongoose from "mongoose";

// A browser that agreed to receive push notifications (one user can have several devices).
const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: String,
  },
  { timestamps: true }
);

export default mongoose.model("PushSubscription", pushSubscriptionSchema);
