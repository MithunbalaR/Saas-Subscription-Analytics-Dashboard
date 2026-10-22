import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import toast from "react-hot-toast";
import { getAccessToken, refreshSession } from "../api/client.js";
import { useAuth } from "./AuthContext.jsx";
import { useWorkspace } from "./WorkspaceContext.jsx";

const RealtimeContext = createContext({ socket: null, connected: false });

// Opens one Socket.io connection while the user is logged in.
// The server pushes "notification" (new bell items) and "data:changed" (someone edited the workspace).
export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const { current } = useWorkspace();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const currentRef = useRef(current);
  currentRef.current = current;
  const userId = user?._id;

  useEffect(() => {
    if (!userId) return;
    const s = io({
      path: "/socket.io",
      auth: (cb) => cb({ token: getAccessToken() }), // read fresh each (re)connect
      withCredentials: true,
    });

    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    // An expired access token is rejected: refresh it and try again.
    s.on("connect_error", (err) => {
      if (err.message === "Not authorized") refreshSession().then(() => s.connect()).catch(() => {});
    });

    // Toast when a teammate changes something in the workspace you're looking at.
    s.on("data:changed", (event) => {
      if (event.by && event.by._id !== userId && event.workspaceId === currentRef.current?._id) {
        toast(`${event.by.name} ${event.action} ${event.entityName || event.entity}`, { icon: "🔄", id: `live-${event.at}` });
      }
    });

    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [userId]);

  return <RealtimeContext.Provider value={{ socket, connected }}>{children}</RealtimeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useRealtime = () => useContext(RealtimeContext);

// Subscribe to a server event while the component is mounted.
// eslint-disable-next-line react-refresh/only-export-components
export const useSocketEvent = (event, handler) => {
  const { socket } = useRealtime();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!socket) return;
    const listener = (payload) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [socket, event]);
};

// Re-run `reload` when anyone changes one of these entity types in the current workspace.
// eslint-disable-next-line react-refresh/only-export-components
export const useLiveRefresh = (entities, reload) => {
  const { current } = useWorkspace();
  const key = entities.join(",");
  useSocketEvent("data:changed", (event) => {
    if (event.workspaceId === current?._id && key.split(",").includes(event.entity)) reload();
  });
};
