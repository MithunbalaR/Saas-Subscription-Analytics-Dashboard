import { useEffect, useRef, useState } from "react";
import { useConfig } from "../context/ConfigContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let scriptPromise = null;

// Load Google Identity Services once, on demand.
const loadGoogleScript = () =>
  (scriptPromise ??= new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement("script"), { src: SCRIPT_SRC, async: true, defer: true });
    script.onload = resolve;
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load Google sign-in"));
    };
    document.head.appendChild(script);
  }));

// "Sign in with Google" button. Renders nothing if the server has no GOOGLE_CLIENT_ID.
// onCredential receives Google's signed ID token, which the server verifies.
export default function GoogleButton({ onCredential, text = "signin_with" }) {
  const { googleClientId } = useConfig();
  const { isDark } = useTheme();
  const containerRef = useRef(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!googleClientId) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: ({ credential }) => callbackRef.current(credential),
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: isDark ? "filled_black" : "outline",
          size: "large",
          text,
          shape: "rectangular",
          width: containerRef.current.offsetWidth || 320,
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [googleClientId, isDark, text]);

  if (!googleClientId) return null;
  return (
    <div>
      <div className="my-5 flex items-center gap-3 text-xs text-stone-400">
        <span className="h-px flex-1 bg-stone-200" /> or <span className="h-px flex-1 bg-stone-200" />
      </div>
      {failed ? (
        <p className="text-center text-xs text-stone-500">Google sign-in couldn't load. Check your internet connection.</p>
      ) : (
        <div ref={containerRef} className="flex min-h-11 w-full justify-center" />
      )}
    </div>
  );
}
