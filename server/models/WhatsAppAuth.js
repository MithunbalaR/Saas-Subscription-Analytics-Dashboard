import mongoose from "mongoose";

// A user's linked-WhatsApp login (Baileys auth state), one document per key: "creds" plus the
// Signal keys (pre-keys, sessions, ...). Kept in MongoDB so links survive server restarts and redeploys.
const whatsAppAuthSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    key: { type: String, required: true },
    value: { type: String, required: true }, // JSON (Buffers encoded with Baileys' BufferJSON)
  },
  { timestamps: true }
);

whatsAppAuthSchema.index({ user: 1, key: 1 }, { unique: true });

export default mongoose.model("WhatsAppAuth", whatsAppAuthSchema);
