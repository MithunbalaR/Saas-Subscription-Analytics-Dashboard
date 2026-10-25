import { useState } from "react";
import { Link } from "react-router-dom";
import AuthShell from "./AuthShell.jsx";
import { Alert } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getErrorMessage } from "../api/client.js";

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError("Passwords do not match");
    setSubmitting(true);
    setError("");
    try {
      await register({ name: form.name, email: form.email, password: form.password });
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Start tracking your SaaS spend in minutes.">
      {error && <Alert>{error}</Alert>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="label">Name</label>
          <input id="name" name="name" autoComplete="name" className="input" required value={form.name} onChange={update} />
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" className="input" required value={form.email} onChange={update} />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" name="password" type="password" minLength={6} autoComplete="new-password" className="input" required value={form.password} onChange={update} />
          <p className="mt-1 text-xs text-stone-500">At least 6 characters.</p>
        </div>
        <div>
          <label htmlFor="confirm" className="label">Confirm password</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" className="input" required value={form.confirm} onChange={update} />
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-500">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-blue-700 hover:underline">Log in</Link>
      </p>
    </AuthShell>
  );
}
