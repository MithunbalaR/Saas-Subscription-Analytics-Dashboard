import Workspace from "../models/Workspace.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Expense from "../models/Expense.js";
import Notification from "../models/Notification.js";
import { httpError, pick } from "../utils/helpers.js";
import { notifyUser } from "../utils/notify.js";
import { createPersonalWorkspace } from "../utils/workspace.js";
import { logActivity } from "../utils/activity.js";

const MEMBER_FIELDS = "name email avatar";

const loadMembership = async (id, userId, { ownerOnly = false } = {}) => {
  const workspace = await Workspace.findById(id);
  const role = workspace?.roleOf(userId);
  if (!role) throw httpError(404, "Workspace not found");
  if (ownerOnly && role !== "owner") throw httpError(403, "Only the workspace owner can do this");
  return workspace;
};

const toResponse = async (workspace, userId) => {
  await workspace.populate("members.user", MEMBER_FIELDS);
  return { ...workspace.toJSON(), myRole: workspace.roleOf(userId) };
};

// GET /api/workspaces
export const getWorkspaces = async (req, res) => {
  const find = () =>
    Workspace.find({ "members.user": req.user._id }).sort({ isPersonal: -1, createdAt: 1 }).populate("members.user", MEMBER_FIELDS);
  let workspaces = await find();
  // Accounts created before workspaces existed (or removed from every team) get a personal one.
  if (workspaces.length === 0) {
    await createPersonalWorkspace(req.user);
    workspaces = await find();
  }
  res.json(workspaces.map((w) => ({ ...w.toJSON(), myRole: w.roleOf(req.user._id) })));
};

// POST /api/workspaces
export const createWorkspace = async (req, res) => {
  const workspace = await Workspace.create({
    ...pick(req.body, ["name", "currency"]),
    owner: req.user._id,
    members: [{ user: req.user._id, role: "owner" }],
  });
  res.status(201).json(await toResponse(workspace, req.user._id));
};

// PUT /api/workspaces/:id  (owner) - name, base currency, budgets
export const updateWorkspace = async (req, res) => {
  const workspace = await loadMembership(req.params.id, req.user._id, { ownerOnly: true });
  workspace.set(pick(req.body, ["name", "currency", "monthlyBudget"]));
  if (req.body.categoryBudgets) {
    const cleaned = Object.entries(req.body.categoryBudgets).filter(([, v]) => Number(v) > 0);
    workspace.categoryBudgets = new Map(cleaned.map(([k, v]) => [k, Number(v)]));
  }
  await workspace.save();
  await logActivity(workspace, req.user, { action: "updated settings of", entity: "workspace", entityName: workspace.name });
  res.json(await toResponse(workspace, req.user._id));
};

// DELETE /api/workspaces/:id  (owner, not the personal workspace)
export const deleteWorkspace = async (req, res) => {
  const workspace = await loadMembership(req.params.id, req.user._id, { ownerOnly: true });
  if (workspace.isPersonal) throw httpError(400, "Your personal workspace can't be deleted");
  await Promise.all([
    Subscription.deleteMany({ workspace: workspace._id }),
    Expense.deleteMany({ workspace: workspace._id }),
    Notification.deleteMany({ workspace: workspace._id }),
  ]);
  await workspace.deleteOne();
  res.json({ message: "Workspace deleted" });
};

// POST /api/workspaces/:id/members  (owner) - add an existing user by email
export const addMember = async (req, res) => {
  const workspace = await loadMembership(req.params.id, req.user._id, { ownerOnly: true });
  if (workspace.isPersonal) throw httpError(400, "Create a team workspace to invite people");

  const invitee = await User.findOne({ email: req.body.email });
  if (!invitee) throw httpError(404, "No SubTrack account uses that email. Ask them to sign up first.");
  if (workspace.roleOf(invitee._id)) throw httpError(409, `${invitee.name} is already a member`);

  workspace.members.push({ user: invitee._id, role: "member" });
  await workspace.save();

  await notifyUser(
    invitee,
    {
      type: "team",
      title: `You were added to ${workspace.name}`,
      message: `${req.user.name} shared the "${workspace.name}" workspace with you. Switch to it from the workspace menu.`,
      link: "/team",
      workspace: workspace._id,
    },
    { email: true, whatsapp: true }
  );
  await logActivity(workspace, req.user, { action: "added", entity: "member", entityName: invitee.name });
  res.status(201).json(await toResponse(workspace, req.user._id));
};

// DELETE /api/workspaces/:id/members/:userId - owner removes someone, or a member leaves
export const removeMember = async (req, res) => {
  const workspace = await loadMembership(req.params.id, req.user._id);
  const isSelf = String(req.params.userId) === String(req.user._id);
  const myRole = workspace.roleOf(req.user._id);

  if (!isSelf && myRole !== "owner") throw httpError(403, "Only the workspace owner can remove members");
  if (workspace.roleOf(req.params.userId) === "owner") throw httpError(400, "The owner can't leave or be removed");
  if (!workspace.roleOf(req.params.userId)) throw httpError(404, "Member not found");

  workspace.members = workspace.members.filter((m) => String(m.user) !== String(req.params.userId));
  const removed = await User.findById(req.params.userId, "name");
  await workspace.save();
  await logActivity(workspace, req.user, { action: isSelf ? "left" : "removed", entity: "member", entityName: removed?.name || "a member" });
  res.json(isSelf ? { message: "You left the workspace" } : await toResponse(workspace, req.user._id));
};
