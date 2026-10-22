import mongoose from "mongoose";
import Workspace from "../models/Workspace.js";
import { createPersonalWorkspace } from "../utils/workspace.js";

// Picks the workspace for this request from the "X-Workspace-Id" header.
// Only workspaces the user is a member of can be selected; otherwise the personal one is used.
export const withWorkspace = async (req, res, next) => {
  const memberOf = { "members.user": req.user._id };
  const requested = req.get("X-Workspace-Id");

  let workspace = null;
  if (requested && mongoose.isValidObjectId(requested)) {
    workspace = await Workspace.findOne({ _id: requested, ...memberOf });
  }
  workspace ??= await Workspace.findOne(memberOf).sort({ isPersonal: -1, createdAt: 1 });
  workspace ??= await createPersonalWorkspace(req.user);

  req.workspace = workspace;
  req.workspaceRole = workspace.roleOf(req.user._id);
  next();
};
