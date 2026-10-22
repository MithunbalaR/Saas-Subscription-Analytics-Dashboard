import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import AuthShell from "./AuthShell.jsx";
import { Alert } from "../components/ui.jsx";
import GoogleButton from "../components/GoogleButton.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getErrorMessage } from "../api/client.js";

// Step 2 of login when two-factor authentication is on.
function TwoFactorStep({ tempToken, onBack }) {
  const { verifyTwoFactor } = useAuth();
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await verifyTwoFactor(tempToken, code);
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Two-factor authentication" subtitle={useRecovery ? "Enter one of your recovery codes." : "Enter the 6-digit code from your authenticator app."}>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit} className="space-y-4">
        <div className="flex justify-center">
          <div className="rounded-full bg-blue-50 p-3">
            <ShieldCheck className="size-6 text-blue-700" />
          </div>
        </div>
        {useRecovery ? (
          <input
            className="input text-center font-mono tracking-widest"
            placeholder="xxxx-xxxx"
            autoComplete="off"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="Recovery code"
            autoFocus
          />
        ) : (
          <input
            className="input text-center text-lg tracking-[0.5em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-label="6-digit code"
            autoFocus
          />
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
          {submitting ? "Verifying…" : "Verify and log in"}
        </button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <button type="button" className="text-stone-500 hover:text-stone-900" onClick={onBack}>← Back</button>
        <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => { setUseRecovery(!useRecovery); setCode(""); setError(""); }}>
          {useRecovery ? "Use authenticator code" : "Use a recovery code"}
        </button>
      </div>
    </AuthShell>
  );
}

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tempToken, setTempToken] = useState(null);

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  // On success the GuestRoute redirects to the dashboard automatically.
  const run = async (action) => {
    setSubmitting(true);
    setError("");
    try {
      const pending = await action();
      if (pending?.twoFactorRequired) setTempToken(pending.tempToken);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (tempToken) return <TwoFactorStep tempToken={tempToken} onBack={() => setTempToken(null)} />;

  return (
    <AuthShell title="Welcome back" subtitle="Log in to see your subscription analytics.">
      {error && <Alert>{error}</Alert>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => login(form.email, form.password));
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" className="input" required value={form.email} onChange={update} />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-stone-700">Password</label>
            <Link to="/forgot-password" className="text-xs font-medium text-blue-700 hover:underline">Forgot password?</Link>
          </div>
          <input id="password" name="password" type="password" autoComplete="current-password" className="input" required value={form.password} onChange={update} />
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      <GoogleButton onCredential={(credential) => run(() => loginWithGoogle(credential))} />
      <p className="mt-6 text-center text-sm text-stone-500">
        New here?{" "}
        <Link to="/register" className="font-medium text-blue-700 hover:underline">Create an account</Link>
      </p>
    </AuthShell>
  );
}
