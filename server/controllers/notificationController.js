import Notification from "../models/Notification.js";
import { httpError } from "../utils/helpers.js";

// GET /api/notifications - latest 30 plus the unread count for the bell badge
export const getNotifications = async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30).populate("workspace", "name"),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  res.json({ items, unread });
};

// PATCH /api/notifications/:id/read
export const markRead = async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { read: true },
    { returnDocument: "after" }
  );
  if (!notification) throw httpError(404, "Notification not found");
  res.json(notification);
};

// PATCH /api/notifications/read-all
export const markAllRead = async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ message: "All notifications marked as read" });
};

// DELETE /api/notifications/:id
export const deleteNotification = async (req, res) => {
  const result = await Notification.deleteOne({ _id: req.params.id, user: req.user._id });
  if (!result.deletedCount) throw httpError(404, "Notification not found");
  res.json({ message: "Notification deleted" });
};
