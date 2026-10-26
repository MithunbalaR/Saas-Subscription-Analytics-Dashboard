import mongoose from "mongoose";
import StoredFile from "../models/StoredFile.js";

// Saves a file uploaded with multer's memory storage and returns the stored document's id.
export const saveUpload = async (file, { kind, owner, workspace }) => {
  const stored = await StoredFile.create({
    kind,
    owner,
    workspace,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    data: file.buffer,
  });
  return String(stored._id);
};

export const deleteStoredFile = async (id) => {
  if (id && mongoose.isValidObjectId(id)) await StoredFile.deleteOne({ _id: id });
};

// Streams a stored file to the browser (404 if it doesn't exist or isn't of the expected kind).
export const sendStoredFile = async (res, id, { kind, disposition, maxAge = 0 }) => {
  const file = mongoose.isValidObjectId(id) ? await StoredFile.findOne({ _id: id, kind }) : null;
  if (!file) return res.status(404).json({ message: "File not found" });
  res.type(file.mimeType);
  res.set("Content-Length", String(file.data.length));
  res.set("Cache-Control", maxAge ? `public, max-age=${maxAge}, immutable` : "private, no-store");
  res.set("X-Content-Type-Options", "nosniff");
  if (disposition) res.set("Content-Disposition", disposition);
  res.send(file.data);
};

// Avatar URLs look like /uploads/avatars/<id>; older Google profile photos are full https URLs.
export const avatarFileId = (avatar) => (avatar?.startsWith("/uploads/avatars/") ? avatar.split("/").pop() : null);
