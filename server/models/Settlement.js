import mongoose from "mongoose";
import { CURRENCIES } from "../utils/currency.js";

// "Priya owes Mithun ₹162 for Netflix" - created when a shared subscription is paid.
const settlementSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
    subscriptionName: { type: String, required: true },
    expense: { type: mongoose.Schema.Types.ObjectId, ref: "Expense" },
    debtorName: { type: String, required: true, trim: true },
    debtorEmail: { type: String, trim: true, lowercase: true },
    debtorPhone: { type: String, trim: true },
    creditor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: CURRENCIES, required: true },
    share: Number,
    settled: { type: Boolean, default: false },
    settledAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("Settlement", settlementSchema);
