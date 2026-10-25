import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { BellRing, Camera, Monitor, Moon, ShieldCheck, Sun, Trash2 } from "lucide-react";
import api, { getErrorMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useConfig } from "../context/ConfigContext.jsx";
import { useI18n } from "../i18n/I18nContext.jsx";
import { LANGUAGES } from "../i18n/translations.js";
import { disablePush, enablePush, getPushSubscription, pushSupported } from "../utils/push.js";
import { useWorkspace } from "../context/WorkspaceContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { Avatar, PageHeader, Toggle } from "../components/ui.jsx";
import { CATEGORIES, CURRENCIES } from "../utils/constants.js";

function Section({ title, description, children }) {
  return (
    <section className="card grid gap-6 p-6 md:grid-cols-3">
      <div>
        <h2 className="section-title">{title}</h2>
        {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
      </div>
      <div className="md:col-span-2">{children}</div>
    </section>
  );
}

// Wraps an async save with a busy flag and success/error toasts.
const useSaver = () => {
  const [busy, setBusy] = useState(false);
  const save = async (action, success) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return [busy, save];
};

function ProfileSection() {
  const { user, updateProfile, uploadAvatar, removeAvatar } = useAuth();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || "");
  const [busy, save] = useSaver();
  const fileInput = useRef(null);

  const chooseAvatar = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("Image must be 2 MB or smaller");
    save(() => uploadAvatar(file), "Profile picture updated");
  };

  return (
    <Section title="Profile" description="How you appear to your team.">
      <div className="mb-5 flex items-center gap-4">
        <Avatar user={user} size="size-16" />
        <div className="flex flex-wrap gap-2">
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={chooseAvatar} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current.click()} disabled={busy}>
            <Camera className="size-4" /> {user.avatar ? "Change photo" : "Upload photo"}
          </button>
          {user.avatar && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => save(removeAvatar, "Photo removed")} disabled={busy}>
              <Trash2 className="size-4" /> Remove
            </button>
          )}
          <p className="w-full text-xs text-stone-500">PNG, JPG or WEBP, up to 2 MB.</p>
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); save(() => updateProfile({ name, phone }), "Profile saved"); }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="label">Name</label>
            <input id="name" className="input" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" className="input" value={user.email} disabled />
          </div>
          <div>
            <label htmlFor="phone" className="label">Phone number (WhatsApp)</label>
            <input id="phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <p className="mt-1 text-xs text-stone-500">Include the country code. Leave empty to stop WhatsApp messages.</p>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>Save profile</button>
      </form>
    </Section>
  );
}

function NotificationSection() {
  const { user, updateProfile } = useAuth();
  const { whatsappEnabled } = useConfig();
  const [form, setForm] = useState({
    emailReminders: user.emailReminders,
    whatsappNotifications: user.whatsappNotifications ?? true,
    reminderDays: user.reminderDays,
  });
  const [busy, save] = useSaver();

  return (
    <Section title="Reminders" description="Renewal reminders and payment confirmations appear in the bell and, if enabled, by email and WhatsApp. Budget alerts are sent at 80% and 100%.">
      <form onSubmit={(e) => { e.preventDefault(); save(() => updateProfile(form), "Reminder settings saved"); }} className="space-y-5">
        <Toggle
          label="Email me reminders, renewal confirmations and budget alerts"
          description={user.email}
          checked={form.emailReminders}
          onChange={(v) => setForm({ ...form, emailReminders: v })}
        />
        <Toggle
          label="Send the same alerts to WhatsApp"
          description={user.phone || "Add your phone number in Profile above to receive WhatsApp messages."}
          checked={form.whatsappNotifications}
          onChange={(v) => setForm({ ...form, whatsappNotifications: v })}
        />
        {user.phone && !whatsappEnabled && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            WhatsApp isn't enabled on the server yet, so messages are only written to the server log.
          </p>
        )}
        <div className="max-w-xs">
          <label htmlFor="reminderDays" className="label">Remind me this many days before a renewal</label>
          <input id="reminderDays" type="number" min={1} max={30} className="input" value={form.reminderDays} onChange={(e) => setForm({ ...form, reminderDays: Number(e.target.value) })} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>Save reminders</button>
      </form>
    </Section>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];
  return (
    <Section title="Appearance" description="Saved on this device.">
      <div className="grid max-w-md grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            role="radio"
            aria-checked={theme === value}
            onClick={() => setTheme(value)}
            className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-sm font-medium ${
              theme === value ? "border-blue-600 bg-blue-50 text-blue-700" : "border-stone-300 text-stone-600 hover:bg-stone-100"
            }`}
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </div>
    </Section>
  );
}

function PasswordSection() {
  const { changePassword } = useAuth();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, save] = useSaver();

  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.confirm) return toast.error("New passwords do not match");
    if (await save(() => changePassword(form.current, form.next), "Password changed. Other devices were logged out.")) {
      setForm({ current: "", next: "", confirm: "" });
    }
  };

  return (
    <Section title="Password" description="Changing your password logs you out on every other device.">
      <form onSubmit={submit} className="space-y-4">
        <div className="max-w-sm">
          <label htmlFor="current" className="label">Current password</label>
          <input id="current" type="password" autoComplete="current-password" className="input" required value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
        </div>
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="next" className="label">New password</label>
            <input id="next" type="password" minLength={6} autoComplete="new-password" className="input" required value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
          </div>
          <div>
            <label htmlFor="confirm" className="label">Confirm new password</label>
            <input id="confirm" type="password" autoComplete="new-password" className="input" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>Change password</button>
      </form>
    </Section>
  );
}

function WorkspaceSection() {
  const { current, isOwner, updateWorkspace } = useWorkspace();
  const [form, setForm] = useState(() => ({
    name: current.name,
    currency: current.currency,
    monthlyBudget: current.monthlyBudget ? String(current.monthlyBudget) : "",
    categoryBudgets: Object.fromEntries(CATEGORIES.map((c) => [c, current.categoryBudgets?.[c] ? String(current.categoryBudgets[c]) : ""])),
  }));
  const [busy, save] = useSaver();

  const submit = (e) => {
    e.preventDefault();
    save(
      () =>
        updateWorkspace(current._id, {
          name: form.name,
          currency: form.currency,
          monthlyBudget: Number(form.monthlyBudget) || 0,
          categoryBudgets: Object.fromEntries(Object.entries(form.categoryBudgets).map(([k, v]) => [k, Number(v) || 0])),
        }),
      "Workspace settings saved"
    );
  };

  return (
    <Section
      title="Workspace & budgets"
      description={isOwner ? `Settings for "${current.name}". Members get alerts at 80% and 100% of each budget.` : "Only the workspace owner can change these settings."}
    >
      <form onSubmit={submit}>
        <fieldset disabled={!isOwner} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ws-name" className="label">Workspace name</label>
              <input id="ws-name" className="input" required maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="ws-currency" className="label">Base currency</label>
              <select id="ws-currency" className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="max-w-xs">
            <label htmlFor="monthlyBudget" className="label">Overall monthly budget ({form.currency})</label>
            <input id="monthlyBudget" type="number" min="0" step="1" className="input" placeholder="0 = no budget" value={form.monthlyBudget} onChange={(e) => setForm({ ...form, monthlyBudget: e.target.value })} />
          </div>
          <div>
            <p className="label">Category budgets ({form.currency} per month, leave empty for none)</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {CATEGORIES.map((c) => (
                <div key={c}>
                  <label htmlFor={`budget-${c}`} className="mb-1 block text-xs text-stone-500">{c}</label>
                  <input
                    id={`budget-${c}`}
                    type="number"
                    min="0"
                    step="1"
                    className="input"
                    value={form.categoryBudgets[c]}
                    onChange={(e) => setForm({ ...form, categoryBudgets: { ...form.categoryBudgets, [c]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          </div>
          {isOwner && <button type="submit" className="btn btn-primary" disabled={busy}>Save workspace</button>}
        </fieldset>
      </form>
    </Section>
  );
}

function LanguageSection() {
  const { language, setLanguage, t } = useI18n();
  return (
    <Section title={t("settings.language")} description="Navigation, page titles and the dashboard are translated.">
      <div className="grid max-w-md grid-cols-3 gap-2" role="radiogroup" aria-label={t("settings.language")}>
        {LANGUAGES.map(({ code, label }) => (
          <button
            key={code}
            role="radio"
            aria-checked={language === code}
            onClick={() => setLanguage(code)}
            className={`rounded-lg border px-3 py-3 text-sm font-medium ${
              language === code ? "border-blue-600 bg-blue-50 text-blue-700" : "border-stone-300 text-stone-600 hover:bg-stone-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </Section>
  );
}

// Two-factor authentication: scan a QR code, confirm a code, save recovery codes.
function SecuritySection() {
  const { user, setUser } = useAuth();
  const [step, setStep] = useState("idle"); // idle | scanning | codes | disabling
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [busy, setBusy] = useState(false);

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      const { data } = await api.post("/auth/2fa/setup");
      setSetup(data);
      setCode("");
      setStep("scanning");
    });

  const confirm = (e) => {
    e.preventDefault();
    run(async () => {
      const { data } = await api.post("/auth/2fa/enable", { code });
      setUser(data.user);
      setRecoveryCodes(data.recoveryCodes);
      setStep("codes");
      toast.success("Two-factor authentication is on");
    });
  };

  const disable = (e) => {
    e.preventDefault();
    run(async () => {
      const { data } = await api.post("/auth/2fa/disable", { password, code });
      setUser(data.user);
      setStep("idle");
      setPassword("");
      setCode("");
      toast.success("Two-factor authentication is off");
    });
  };

  const downloadCodes = () => {
    const blob = new Blob([`SubTrack recovery codes for ${user.email}\nEach code works once.\n\n${recoveryCodes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: "subtrack-recovery-codes.txt" }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Section title="Two-factor authentication" description="Protect your account with a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy) in addition to your password.">
      {step === "codes" ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-green-700">2FA is on. Save these recovery codes now; they won't be shown again.</p>
          <p className="text-sm text-stone-600">If you lose your phone, each code lets you log in once.</p>
          <div className="grid max-w-sm grid-cols-2 gap-2 rounded-lg bg-stone-100 p-4 font-mono text-sm">
            {recoveryCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={downloadCodes}>Download codes</button>
            <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n")).then(() => toast.success("Copied"))}>Copy</button>
            <button className="btn btn-primary btn-sm" onClick={() => setStep("idle")}>I've saved them</button>
          </div>
        </div>
      ) : user.twoFactorEnabled ? (
        step === "disabling" ? (
          <form onSubmit={disable} className="max-w-sm space-y-3">
            <div>
              <label htmlFor="disable-password" className="label">Password</label>
              <input id="disable-password" type="password" className="input" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <div>
              <label htmlFor="disable-code" className="label">Authenticator or recovery code</label>
              <input id="disable-code" className="input" required value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setStep("idle")}>Cancel</button>
              <button type="submit" className="btn btn-danger" disabled={busy}>Turn off 2FA</button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700"><ShieldCheck className="size-4" /> Two-factor authentication is on</span>
            <button className="btn btn-secondary btn-sm" onClick={() => { setStep("disabling"); setCode(""); }}>Turn off</button>
          </div>
        )
      ) : step === "scanning" && setup ? (
        <form onSubmit={confirm} className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-600">
            <li>Open your authenticator app and scan this QR code.</li>
            <li>Enter the 6-digit code it shows to finish.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <img src={setup.qrCode} alt="QR code for your authenticator app" className="size-44 rounded-lg border border-stone-200 bg-white p-2" />
            <div className="text-xs text-stone-500">
              <p>Can't scan? Enter this key manually:</p>
              <p className="mt-1 font-mono text-sm break-all text-stone-900">{setup.secret}</p>
            </div>
          </div>
          <div className="flex max-w-sm gap-2">
            <input className="input text-center tracking-[0.4em]" inputMode="numeric" maxLength={6} pattern="\d{6}" required placeholder="123456" aria-label="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>Verify</button>
          </div>
          <button type="button" className="text-sm text-stone-500 hover:text-stone-900" onClick={() => setStep("idle")}>Cancel</button>
        </form>
      ) : (
        <button className="btn btn-primary" onClick={start} disabled={busy}>
          <ShieldCheck className="size-4" /> Set up two-factor authentication
        </button>
      )}
    </Section>
  );
}

// Browser push notifications for this device (works even when SubTrack isn't open).
function PushSection() {
  const { vapidPublicKey } = useConfig();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();

  useEffect(() => {
    getPushSubscription().then((s) => setEnabled(Boolean(s))).catch(() => {});
  }, []);

  const toggle = async (on) => {
    setBusy(true);
    try {
      if (on) await enablePush(vapidPublicKey);
      else await disablePush();
      setEnabled(on);
      toast.success(on ? "Push notifications on for this device" : "Push notifications off for this device");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    try {
      const { data } = await api.post("/push/test");
      toast.success(data.message);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Section title="Push notifications" description="Get renewal reminders and budget alerts as system notifications on this device, even when SubTrack is closed. You can also install SubTrack as an app from your browser's menu.">
      {!supported ? (
        <p className="text-sm text-stone-500">This browser doesn't support push notifications.</p>
      ) : !vapidPublicKey ? (
        <p className="text-sm text-stone-500">Push notifications aren't set up on the server (VAPID keys missing).</p>
      ) : (
        <div className="space-y-4">
          <Toggle label="Push notifications on this device" description={enabled ? "On" : "Off"} checked={enabled} onChange={(v) => !busy && toggle(v)} />
          {enabled && (
            <button className="btn btn-secondary btn-sm" onClick={test}>
              <BellRing className="size-4" /> Send a test notification
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

export default function Settings() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />
      <div className="space-y-4">
        <ProfileSection />
        <SecuritySection />
        <NotificationSection />
        <PushSection />
        <LanguageSection />
        <AppearanceSection />
        <PasswordSection />
        <WorkspaceSection />
      </div>
    </>
  );
}
