import jwt from "jsonwebtoken";
import { Server } from "socket.io";

// Socket.io lets the server push events to open browsers instantly (no refresh or polling).
// Every connected user joins a private room "user:<id>"; workspace events are sent to each member's room.
let io = null;

export const initRealtime = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true },
  });

  // Only logged-in users may connect: the access token is checked once, on connect.
  io.use((socket, next) => {
    try {
      const { id } = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
      socket.data.userId = id;
      next();
    } catch {
      next(new Error("Not authorized"));
    }
  });

  io.on("connection", (socket) => socket.join(`user:${socket.data.userId}`));
  return io;
};

export const emitToUsers = (userIds, event, payload) => {
  if (!io || !userIds.length) return;
  io.to(userIds.map((id) => `user:${id}`)).emit(event, payload);
};

// Sends to every member of a workspace (members may be populated documents or plain ids).
export const emitToWorkspace = (workspace, event, payload) =>
  emitToUsers(
    workspace.members.map((m) => String(m.user?._id ?? m.user)),
    event,
    payload
  );
