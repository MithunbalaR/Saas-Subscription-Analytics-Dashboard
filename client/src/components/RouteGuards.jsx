import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Spinner } from "./ui.jsx";

// Only logged-in users can see these routes.
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner fullScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

// Role-based access: only admins can open the admin panel.
export function AdminRoute() {
  const { user } = useAuth();
  return user?.role === "admin" ? <Outlet /> : <Navigate to="/" replace />;
}

// Login / register pages redirect to the dashboard when already logged in.
export function GuestRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner fullScreen />;
  if (user) return <Navigate to={location.state?.from?.pathname || "/"} replace />;
  return <Outlet />;
}
