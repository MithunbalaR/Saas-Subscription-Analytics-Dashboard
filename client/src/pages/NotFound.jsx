import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Brand } from "../components/ui.jsx";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="mb-10">
        <Brand />
      </div>
      <div className="mb-4 rounded-full bg-stone-100 p-4">
        <Compass className="size-8 text-stone-500" />
      </div>
      <p className="text-sm font-semibold text-blue-700">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-stone-500">The page you're looking for doesn't exist or has been moved.</p>
      <Link to="/" className="btn btn-primary mt-6">Go to dashboard</Link>
    </div>
  );
}
