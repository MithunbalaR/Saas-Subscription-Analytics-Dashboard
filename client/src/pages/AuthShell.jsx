import { BarChart3, BellRing, Users, Wallet } from "lucide-react";
import { Brand } from "../components/ui.jsx";

const FEATURES = [
  { icon: Wallet, text: "Track every SaaS subscription, in any currency" },
  { icon: BellRing, text: "Get reminded before renewals and budget overruns" },
  { icon: BarChart3, text: "See spending trends and savings opportunities" },
  { icon: Users, text: "Share a workspace with your team" },
];

// Shared two-column layout for the login, register and password reset pages.
export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-blue-600 p-12 text-white lg:flex">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-8 rounded-lg ring-1 ring-white/40" />
          <span className="text-lg font-semibold">SubTrack</span>
        </div>
        <div>
          <h2 className="max-w-md text-3xl leading-tight font-semibold">Know exactly what your software stack costs you.</h2>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/90">
                <Icon className="size-5 shrink-0" />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-white/70">SaaS Subscription & Expense Analytics</p>
      </div>

      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-stone-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
