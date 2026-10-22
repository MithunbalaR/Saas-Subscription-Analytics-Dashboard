import Activity from "../models/Activity.js";
import { getPaging } from "../utils/helpers.js";

// GET /api/activity?page=&limit= - the workspace's audit trail, newest first
export const getActivity = async (req, res) => {
  const { page, limit, skip } = getPaging(req.query, 15);
  const filter = { workspace: req.workspace._id };
  const [items, total] = await Promise.all([
    Activity.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("user", "name avatar"),
    Activity.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
};
