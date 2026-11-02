import mongoose from "mongoose";
import { CATEGORIES, BILLING_CYCLES, STATUSES, toMonthly, round2 } from "../utils/billing.js";
import { CURRENCIES } from "../utils/currency.js";

// One entry per price the plan has had - used for price-hike alerts and the price history chart.
const priceSchema = new mongoose.Schema(
  {
    cost: { type: Number, required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// People who share the cost (e.g. a family plan). Whoever records the payment is owed their shares.
const splitPartSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Each person needs a name"], trim: true, maxlength: 60 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, match: [/^(\+[1-9]\d{7,14})?$/, "Enter a valid phone number"] }, // WhatsApp, E.164
    share: { type: Number, required: true, min: [1, "Share must be at least 1%"], max: [99, "Share must be under 100%"] },
  },
  { _id: false }
);

const subscriptionSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: [true, "Name is required"], trim: true, maxlength: 80 },
    category: { type: String, enum: CATEGORIES, default: "Other" },
    cost: { type: Number, required: [true, "Cost is required"], min: [0, "Cost cannot be negative"] },
    currency: { type: String, enum: CURRENCIES, default: "INR" },
    billingCycle: { type: String, enum: BILLING_CYCLES, default: "monthly" },
    startDate: { type: Date, default: Date.now },
    nextRenewal: { type: Date, required: [true, "Next renewal date is required"] },
    status: { type: String, enum: STATUSES, default: "active" },
    statusChangedAt: { type: Date, default: Date.now },
    // Free trial: nextRenewal is the day the trial ends and the first charge happens.
    isTrial: { type: Boolean, default: false },
    paymentMethod: { type: String, trim: true, maxlength: 40 },
    website: { type: String, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 500 },
    priceHistory: [priceSchema],
    splitWith: {
      type: [splitPartSchema],
      default: [],
      validate: {
        validator: (parts) => parts.reduce((sum, p) => sum + p.share, 0) < 100,
        message: "Shares of the other people must add up to less than 100% (the rest is yours)",
      },
    },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

subscriptionSchema.pre("save", function () {
  // Track when a plan was paused/cancelled - used by the "paused for a long time" insight.
  if (this.isModified("status") && !this.isNew) this.statusChangedAt = new Date();
  // Record every price the plan has had.
  if (this.isNew && this.priceHistory.length === 0) {
    this.priceHistory.push({ cost: this.cost, currency: this.currency, changedAt: this.startDate || new Date() });
  } else if (!this.isNew && (this.isModified("cost") || this.isModified("currency"))) {
    this.priceHistory.push({ cost: this.cost, currency: this.currency, changedAt: new Date() });
  }
});

// Cost normalised to one month, in the subscription's own currency.
subscriptionSchema.virtual("monthlyCost").get(function () {
  return round2(toMonthly(this.cost, this.billingCycle));
});

// Percentage change between the last two prices in the same currency (null if never changed).
subscriptionSchema.virtual("lastPriceChange").get(function () {
  const h = this.priceHistory || [];
  if (h.length < 2) return null;
  const [prev, last] = h.slice(-2);
  if (prev.currency !== last.currency || !prev.cost) return null;
  return { from: prev.cost, to: last.cost, percent: round2(((last.cost - prev.cost) / prev.cost) * 100), changedAt: last.changedAt };
});

export default mongoose.model("Subscription", subscriptionSchema);
