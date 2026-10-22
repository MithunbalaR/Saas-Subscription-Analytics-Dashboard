import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { API_BASE, getAccessToken, getWorkspaceId, refreshSession } from "../api/client.js";
import { useConfig } from "../context/ConfigContext.jsx";
import { useI18n } from "../i18n/I18nContext.jsx";
import Markdown from "./Markdown.jsx";

const PROVIDER_LABELS = { claude: "Claude", gemini: "Google Gemini", basic: "Smart answers (offline)" };

const SUGGESTIONS = [
  "How much do I spend per month in total?",
  "Which subscriptions should I cancel to save money?",
  "What renews in the next 7 days?",
  "Which prices went up recently?",
];

// Reads a Server-Sent Events stream: "event: text\ndata: {...}\n\n"
async function* readEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = raw.match(/^event: (.*)$/m)?.[1];
      const data = raw.match(/^data: (.*)$/m)?.[1];
      if (event && data) yield { event, data: JSON.parse(data) };
    }
  }
}

const postChat = (messages, signal) =>
  fetch(`${API_BASE}/ai/chat`, {
    method: "POST",
    credentials: "include",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
      "X-Workspace-Id": getWorkspaceId() || "",
    },
    body: JSON.stringify({ messages }),
  });

// Floating "Ask SubTrack AI" chat. Answers stream in word by word from Claude.
export default function AiAssistant() {
  const { aiEnabled, aiProvider } = useConfig();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const ask = async (question) => {
    const text = question.trim();
    if (!text || busy) return;
    const history = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setError("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const appendText = (chunk) =>
      setMessages((list) => [...list.slice(0, -1), { ...list.at(-1), content: list.at(-1).content + chunk }]);
    const setProvider = (provider) => setMessages((list) => [...list.slice(0, -1), { ...list.at(-1), provider }]);

    try {
      const payload = history.map(({ role, content }) => ({ role, content }));
      let response = await postChat(payload, controller.signal);
      if (response.status === 401) {
        await refreshSession();
        response = await postChat(payload, controller.signal);
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `Request failed (${response.status})`);
      }
      for await (const { event, data } of readEvents(response)) {
        if (event === "meta") setProvider(data.provider);
        if (event === "text") appendText(data.text);
        if (event === "error") throw new Error(data.message);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message);
        setMessages((list) => (list.at(-1)?.content ? list : list.slice(0, -1))); // drop an empty answer bubble
      }
    } finally {
      // Mark the answer as complete so its "Answered by" label appears only after the last word.
      setMessages((list) => (list.at(-1)?.role === "assistant" ? [...list.slice(0, -1), { ...list.at(-1), done: true }] : list));
      setBusy(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();
  const reset = () => {
    stop();
    setMessages([]);
    setError("");
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-blue-500 md:right-6 md:bottom-6"
          aria-label={t("ai.title")}
        >
          <Sparkles className="size-4" /> <span className="hidden sm:inline">{t("ai.title")}</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={t("ai.title")}
          className="card fixed inset-x-2 bottom-2 z-50 flex h-[min(36rem,calc(100vh-1rem))] flex-col overflow-hidden shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[26rem]"
        >
          <div className="flex items-center justify-between border-b border-stone-200 bg-blue-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4" />
              <div>
                <p className="text-sm leading-tight font-semibold">{t("ai.title")}</p>
                {aiProvider && <p className="text-[10px] leading-tight text-white/75">Powered by {PROVIDER_LABELS[aiProvider]}</p>}
              </div>
            </div>
            <div className="flex gap-1">
              {messages.length > 0 && (
                <button onClick={reset} className="rounded-md p-1.5 hover:bg-white/15" aria-label="New conversation" title="New conversation">
                  <RotateCcw className="size-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="rounded-md p-1.5 hover:bg-white/15" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {!aiEnabled ? (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("ai.notConfigured")}</p>
            ) : messages.length === 0 ? (
              <>
                <p className="text-sm text-stone-600">{t("ai.welcome")}</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => ask(s)} className="rounded-lg border border-stone-200 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50">
                      {s}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-sm whitespace-pre-wrap text-white">
                    {m.content}
                  </div>
                ) : (
                  <div key={i} className="mr-4">
                    <div className="rounded-2xl rounded-bl-sm bg-stone-100 px-3 py-2 text-stone-900">
                      {m.content ? <Markdown text={m.content} /> : <Loader2 className="size-4 animate-spin text-stone-500" aria-label="Thinking" />}
                    </div>
                    {m.done && m.provider && m.content && <p className="mt-1 pl-1 text-[10px] text-stone-400">Answered by {PROVIDER_LABELS[m.provider]}</p>}
                  </div>
                )
              )
            )}
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          </div>

          {aiEnabled && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
              className="flex items-end gap-2 border-t border-stone-200 p-3"
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                maxLength={2000}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
                placeholder={t("ai.placeholder")}
                aria-label={t("ai.placeholder")}
                className="input max-h-28 resize-none"
              />
              {busy ? (
                <button type="button" onClick={stop} className="btn btn-secondary px-3" aria-label="Stop">
                  <Square className="size-4" />
                </button>
              ) : (
                <button type="submit" className="btn btn-primary px-3" disabled={!input.trim()} aria-label="Send">
                  <ArrowUp className="size-4" />
                </button>
              )}
            </form>
          )}
          <p className="px-3 pb-2 text-center text-[10px] text-stone-400">AI answers can be wrong. Check important numbers.</p>
        </div>
      )}
    </>
  );
}
