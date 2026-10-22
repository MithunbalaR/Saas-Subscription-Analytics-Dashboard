import mongoose from "mongoose";

// Audit trail for a workspace: who did what, and when.
const activitySchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true }, // created | updated | deleted | paid | imported | ...
    entity: { type: String, required: true }, // subscription | expense | member | workspace | settlement
    entityName: String,
    details: String,
  },
  { timestamps: true }
);

activitySchema.index({ workspace: 1, createdAt: -1 });

export default mongoose.model("Activity", activitySchema);
