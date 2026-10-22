import Activity from "../models/Activity.js";
import { emitToWorkspace } from "./realtime.js";

// Records "who did what" in a workspace and tells every open browser in that workspace to refresh.
export const logActivity = async (workspace, user, { action, entity, entityName, details }) => {
  try {
    const activity = await Activity.create({ workspace: workspace._id, user: user?._id, action, entity, entityName, details });
    emitToWorkspace(workspace, "data:changed", {
      workspaceId: String(workspace._id),
      entity,
      action,
      entityName,
      by: user ? { _id: String(user._id), name: user.name } : null,
      at: activity.createdAt,
    });
  } catch (err) {
    console.error("Activity log failed:", err.message);
  }
};
