import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AdminRoute, GuestRoute, ProtectedRoute } from "./components/RouteGuards.jsx";
import { Spinner } from "./components/ui.jsx";
import Layout from "./components/Layout.jsx";

// Pages are loaded on demand (code splitting) so the first load stays small.
const Login = lazy(() => import("./pages/Login.jsx"));
const Register = lazy(() => import("./pages/Register.jsx"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Subscriptions = lazy(() => import("./pages/Subscriptions.jsx"));
const Expenses = lazy(() => import("./pages/Expenses.jsx"));
const Calendar = lazy(() => import("./pages/Calendar.jsx"));
const Splits = lazy(() => import("./pages/Splits.jsx"));
const Team = lazy(() => import("./pages/Team.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const Admin = lazy(() => import("./pages/Admin.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));

export default function App() {
  return (
    <Suspense fallback={<Spinner fullScreen />}>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/splits" element={<Splits />} />
            <Route path="/team" element={<Team />} />
            <Route path="/settings" element={<Settings />} />
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<Admin />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
