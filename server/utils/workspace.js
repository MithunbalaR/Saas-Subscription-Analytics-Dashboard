import Workspace from "../models/Workspace.js";

export const createPersonalWorkspace = (user, extra = {}) =>
  Workspace.create({
    name: `${user.name.split(" ")[0]}'s Workspace`,
    owner: user._id,
    members: [{ user: user._id, role: "owner" }],
    isPersonal: true,
    ...extra,
  });
