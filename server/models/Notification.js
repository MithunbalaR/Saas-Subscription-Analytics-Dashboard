import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace" },
    type: { type: String, enum: ["renewal", "trial", "payment", "price", "budget", "team", "split", "system"], default: "system" },
    title: { type: String, required: true, maxlength: 140 },
    message: { type: String, maxlength: 500 },
    link: String,
    read: { type: Boolean, default: false },
    // Prevents the same alert (e.g. "Netflix renews in 3 days") being created twice.
    dedupeKey: String,
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index(
  { user: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);

export default mongoose.model("Notification", notificationSchema);
