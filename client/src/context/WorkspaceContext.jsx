import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api, { setWorkspaceId } from "../api/client.js";
import { useAuth } from "./AuthContext.jsx";

const WorkspaceContext = createContext(null);
const STORAGE_KEY = "workspaceId";

const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

// Holds the list of workspaces the user belongs to and which one is currently selected.
// The selected id is sent with every API request as the X-Workspace-Id header.
export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const userId = user?._id;
  const [workspaces, setWorkspaces] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Update the API header *before* the state change so the next requests already use it.
  const select = useCallback((id) => {
    setWorkspaceId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    setCurrentId(id);
  }, []);

  const reload = useCallback(async () => {
    const { data } = await api.get("/workspaces");
    setWorkspaces(data);
    setCurrentId((previous) => {
      const wanted = previous ?? readStored();
      const id = data.some((w) => w._id === wanted) ? wanted : data[0]?._id;
      setWorkspaceId(id);
      return id;
    });
    return data;
  }, []);

  useEffect(() => {
    if (!userId) {
      setWorkspaces([]);
      setCurrentId(null);
      setWorkspaceId(null);
      setLoading(true);
      return;
    }
    reload()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, reload]);

  const replace = (updated) => setWorkspaces((list) => list.map((w) => (w._id === updated._id ? updated : w)));

  const createWorkspace = async (form) => {
    const { data } = await api.post("/workspaces", form);
    setWorkspaces((list) => [...list, data]);
    select(data._id);
    return data;
  };

  const updateWorkspace = async (id, updates) => {
    const { data } = await api.put(`/workspaces/${id}`, updates);
    replace(data);
    return data;
  };

  const deleteWorkspace = async (id) => {
    await api.delete(`/workspaces/${id}`);
    const remaining = workspaces.filter((w) => w._id !== id);
    setWorkspaces(remaining);
    if (currentId === id) select(remaining[0]._id);
  };

  const addMember = async (id, email) => replace((await api.post(`/workspaces/${id}/members`, { email })).data);
  const removeMember = async (id, memberId) => replace((await api.delete(`/workspaces/${id}/members/${memberId}`)).data);

  const leaveWorkspace = async (id) => {
    await api.delete(`/workspaces/${id}/members/${userId}`);
    const remaining = workspaces.filter((w) => w._id !== id);
    setWorkspaces(remaining);
    select(remaining[0]._id);
  };

  const current = workspaces.find((w) => w._id === currentId) || null;

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        current,
        currency: current?.currency || "INR",
        isOwner: current?.myRole === "owner",
        loading,
        select,
        reload,
        createWorkspace,
        updateWorkspace,
        deleteWorkspace,
        addMember,
        removeMember,
        leaveWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useWorkspace = () => useContext(WorkspaceContext);
