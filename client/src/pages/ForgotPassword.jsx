import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import AuthShell from "./AuthShell.jsx";
import { Alert } from "../components/ui.jsx";
import api, { getErrorMessage } from "../api/client.js";

// Step 1: request a 6-digit code by email. Step 2: enter the code and a new password.
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [form, setForm] = useState({ email: "", otp: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const requestCode = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/forgot-password", { email: form.email });
      toast.success(data.message);
      setStep("reset");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError("Passwords do not match");
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/reset-password", { email: form.email, otp: form.otp, password: form.password });
      toast.success(data.message);
      navigate("/login");
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={step === "email" ? "Reset your password" : "Enter your code"}
      subtitle={step === "email" ? "We'll email you a 6-digit code." : `We sent a code to ${form.email}. It expires in 10 minutes.`}
    >
      {error && <Alert>{error}</Alert>}

      {step === "email" ? (
        <form onSubmit={requestCode} className="space-y-4">
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" className="input" required value={form.email} onChange={update} />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={resetPassword} className="space-y-4">
          <div>
            <label htmlFor="otp" className="label">6-digit code</label>
            <input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" className="input text-center text-lg tracking-[0.5em]" required value={form.otp} onChange={update} />
          </div>
          <div>
            <label htmlFor="password" className="label">New password</label>
            <input id="password" name="password" type="password" minLength={6} autoComplete="new-password" className="input" required value={form.password} onChange={update} />
          </div>
          <div>
            <label htmlFor="confirm" className="label">Confirm new password</label>
            <input id="confirm" name="confirm" type="password" autoComplete="new-password" className="input" required value={form.confirm} onChange={update} />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Resetting…" : "Reset password"}
          </button>
          <button type="button" className="w-full text-sm text-stone-500 hover:text-stone-900" onClick={requestCode} disabled={busy}>
            Didn't get it? Send a new code
          </button>
        </form>
      )}

      {import.meta.env.DEV && (
        <p className="mt-4 rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
          Development tip: if email (SMTP) isn't configured, the code is printed in the server terminal.
        </p>
      )}
      <p className="mt-6 text-center text-sm text-stone-500">
        <Link to="/login" className="font-medium text-blue-700 hover:underline">Back to login</Link>
      </p>
    </AuthShell>
  );
}
