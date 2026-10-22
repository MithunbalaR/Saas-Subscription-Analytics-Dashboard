import mongoose from "mongoose";
import { CURRENCIES } from "../utils/currency.js";

// A workspace holds subscriptions and expenses. Every user gets a personal one,
// and can create team workspaces and invite other users to share them.
const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "member"], default: "member" },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const workspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Workspace name is required"], trim: true, maxlength: 60 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [memberSchema],
    isPersonal: { type: Boolean, default: false },
    // Base currency: all analytics are converted into this currency.
    currency: { type: String, enum: CURRENCIES, default: "INR" },
    monthlyBudget: { type: Number, min: [0, "Budget cannot be negative"], default: 0 },
    categoryBudgets: { type: Map, of: Number, default: {} },
  },
  { timestamps: true }
);

workspaceSchema.index({ "members.user": 1 });

workspaceSchema.methods.roleOf = function (userId) {
  return this.members.find((m) => String(m.user?._id ?? m.user) === String(userId))?.role ?? null;
};

export default mongoose.model("Workspace", workspaceSchema);
