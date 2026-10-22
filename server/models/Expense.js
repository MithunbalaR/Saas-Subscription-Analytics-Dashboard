import mongoose from "mongoose";
import { CATEGORIES } from "../utils/billing.js";
import { CURRENCIES } from "../utils/currency.js";

const expenseSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 100 },
    amount: { type: Number, required: [true, "Amount is required"], min: [0, "Amount cannot be negative"] },
    currency: { type: String, enum: CURRENCIES, default: "INR" },
    category: { type: String, enum: CATEGORIES, default: "Other" },
    date: { type: Date, required: [true, "Date is required"] },
    // Set when the expense is a payment for a tracked subscription.
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription", default: null },
    notes: { type: String, trim: true, maxlength: 500 },
    // Uploaded invoice/receipt (stored on disk, served only to workspace members).
    receipt: {
      filename: String,
      originalName: String,
      mimeType: String,
      size: Number,
    },
  },
  { timestamps: true }
);

expenseSchema.index({ workspace: 1, date: -1 });

export default mongoose.model("Expense", expenseSchema);
