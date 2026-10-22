import { useState } from "react";
import toast from "react-hot-toast";
import { LogOut, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { getErrorMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useWorkspace } from "../context/WorkspaceContext.jsx";
import { Avatar, Badge, Modal, PageHeader } from "../components/ui.jsx";
import ActivityFeed from "../components/ActivityFeed.jsx";
import { useI18n } from "../i18n/I18nContext.jsx";
import { CURRENCIES } from "../utils/constants.js";
import { formatDate } from "../utils/format.js";

function CreateWorkspaceForm({ onDone }) {
  const { createWorkspace } = useWorkspace();
  const [form, setForm] = useState({ name: "", currency: "INR" });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ws = await createWorkspace(form);
      toast.success(`${ws.name} created. You're now working in it.`);
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="ws-name" className="label">Workspace name</label>
        <input id="ws-name" className="input" required maxLength={60} placeholder="e.g. Startup Team" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div>
        <label htmlFor="ws-currency" className="label">Base currency</label>
        <select id="ws-currency" className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-stone-500">All analytics in this workspace are shown in this currency.</p>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating…" : "Create workspace"}</button>
      </div>
    </form>
  );
}

export default function Team() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { workspaces, current, isOwner, select, addMember, removeMember, leaveWorkspace, deleteWorkspace } = useWorkspace();
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [creating, setCreating] = useState(false);

  const invite = async (e) => {
    e.preventDefault();
    setInviting(true);
    try {
      await addMember(current._id, email);
      toast.success(`${email} now has access to ${current.name}`);
      setEmail("");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setInviting(false);
    }
  };

  const remove = async (member) => {
    if (!window.confirm(`Remove ${member.user.name} from ${current.name}?`)) return;
    try {
      await removeMember(current._id, member.user._id);
      toast.success(`${member.user.name} removed`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const leave = async () => {
    if (!window.confirm(`Leave ${current.name}? You'll lose access to its subscriptions and expenses.`)) return;
    try {
      const name = current.name;
      await leaveWorkspace(current._id);
      toast.success(`You left ${name}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const destroy = async () => {
    if (!window.confirm(`Delete ${current.name} and ALL its subscriptions and expenses for every member? This can't be undone.`)) return;
    try {
      const name = current.name;
      await deleteWorkspace(current._id);
      toast.success(`${name} deleted`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title={t("team.title")} description="Share subscriptions and expenses with your team, and see who changed what.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> New workspace
        </button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-5 py-4">
            <div>
              <h2 className="section-title">{current.name}</h2>
              <p className="mt-0.5 text-xs text-stone-500">
                {current.isPersonal ? "Personal workspace" : "Team workspace"} · {current.currency} · {current.members.length} member{current.members.length === 1 ? "" : "s"}
              </p>
            </div>
            <Badge tone={isOwner ? "blue" : "neutral"}>You are {isOwner ? "the owner" : "a member"}</Badge>
          </div>

          {current.isPersonal ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <div className="mb-3 rounded-full bg-stone-100 p-3">
                <Users className="size-6 text-stone-500" />
              </div>
              <p className="font-medium">This is your private workspace</p>
              <p className="mt-1 max-w-sm text-sm text-stone-500">
                To share subscriptions with colleagues, create a team workspace and add them by email.
              </p>
              <button className="btn btn-primary mt-4" onClick={() => setCreating(true)}>
                <Plus className="size-4" /> Create a team workspace
              </button>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-stone-100">
                {current.members.map((member) => (
                  <li key={member.user._id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar user={member.user} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {member.user.name} {member.user._id === user._id && <span className="text-stone-500">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-stone-500">{member.user.email} · joined {formatDate(member.joinedAt)}</p>
                    </div>
                    <Badge tone={member.role === "owner" ? "blue" : "neutral"}>{member.role}</Badge>
                    {isOwner && member.role !== "owner" && (
                      <button className="icon-btn hover:text-red-700" onClick={() => remove(member)} aria-label={`Remove ${member.user.name}`}>
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {isOwner ? (
                <form onSubmit={invite} className="flex flex-wrap gap-2 border-t border-stone-200 px-5 py-4">
                  <label htmlFor="invite" className="sr-only">Email address</label>
                  <input id="invite" type="email" required className="input min-w-56 flex-1" placeholder="colleague@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <button type="submit" className="btn btn-primary" disabled={inviting}>
                    <UserPlus className="size-4" /> {inviting ? "Adding…" : "Add member"}
                  </button>
                  <p className="w-full text-xs text-stone-500">They need a SubTrack account. They'll get a notification and an email.</p>
                </form>
              ) : (
                <div className="border-t border-stone-200 px-5 py-4">
                  <button className="btn btn-secondary" onClick={leave}>
                    <LogOut className="size-4" /> Leave workspace
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section className="card h-fit">
          <h2 className="section-title border-b border-stone-200 px-5 py-4">Your workspaces</h2>
          <ul className="divide-y divide-stone-100">
            {workspaces.map((w) => (
              <li key={w._id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{w.name}</p>
                  <p className="text-xs text-stone-500">
                    {w.isPersonal ? "Personal" : `${w.members.length} members`} · {w.currency} · {w.myRole}
                  </p>
                </div>
                {w._id === current._id ? (
                  <Badge tone="blue">Current</Badge>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={() => select(w._id)}>Switch</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-4">
        <ActivityFeed />
      </div>

      {isOwner && !current.isPersonal && (
        <section className="card mt-4 border-red-200 p-5">
          <h2 className="section-title text-red-700">Danger zone</h2>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-stone-500">Delete this workspace and all of its subscriptions and expenses for every member.</p>
            <button className="btn btn-danger" onClick={destroy}>
              <Trash2 className="size-4" /> Delete workspace
            </button>
          </div>
        </section>
      )}

      {creating && (
        <Modal title="New team workspace" onClose={() => setCreating(false)}>
          <CreateWorkspaceForm onDone={() => setCreating(false)} />
        </Modal>
      )}
    </>
  );
}
