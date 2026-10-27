import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Name is required"], trim: true, maxlength: 60 },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    avatar: { type: String, default: "" },
    emailReminders: { type: Boolean, default: true },
    // Phone number in E.164 format (+919876543210).
    phone: { type: String, trim: true, default: "", match: [/^(\+[1-9]\d{7,14})?$/, "Enter a valid phone number"] },
    reminderDays: { type: Number, min: 1, max: 30, default: 3 },
    lastLoginAt: Date,
    language: { type: String, enum: ["en", "hi", "ta"], default: "en" },
    // Two-factor authentication (TOTP, e.g. Google Authenticator).
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    twoFactorPendingSecret: { type: String, select: false },
    recoveryCodes: { type: [String], select: false }, // stored hashed, each usable once
    // Incremented on password change/reset to invalidate all existing refresh tokens.
    tokenVersion: { type: Number, default: 0, select: false },
    // Forgot-password one-time code (stored hashed, never in plain text).
    resetOtpHash: { type: String, select: false },
    resetOtpExpires: { type: Date, select: false },
    resetOtpAttempts: { type: Number, default: 0, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.tokenVersion;
        delete ret.resetOtpHash;
        delete ret.resetOtpExpires;
        delete ret.resetOtpAttempts;
        delete ret.twoFactorSecret;
        delete ret.twoFactorPendingSecret;
        delete ret.recoveryCodes;
        delete ret.googleId; // left over on accounts created with the removed Google sign-in
        return ret;
      },
    },
  }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.matchPassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model("User", userSchema);
