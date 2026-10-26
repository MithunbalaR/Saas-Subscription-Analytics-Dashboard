import mongoose from "mongoose";

// Uploaded files (profile pictures and receipts) are stored in MongoDB rather than on the server's disk,
// so they survive restarts and redeploys on hosts with a temporary filesystem (e.g. Render's free plan).
// Uploads are small (2 MB avatars, 5 MB receipts), well under MongoDB's 16 MB document limit.
const storedFileSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["avatar", "receipt"], required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace" }, // receipts only
    originalName: { type: String, maxlength: 255 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

storedFileSchema.index({ workspace: 1 });
storedFileSchema.index({ owner: 1, kind: 1 });

export default mongoose.model("StoredFile", storedFileSchema);
