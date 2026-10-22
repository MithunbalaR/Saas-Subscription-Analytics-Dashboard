import Anthropic from "@anthropic-ai/sdk";
import Subscription from "../models/Subscription.js";
import Expense from "../models/Expense.js";
import Settlement from "../models/Settlement.js";
import { round2, startOfToday, toMonthly } from "../utils/billing.js";
import { convert, getRates } from "../utils/currency.js";
import { smartAnswer } from "../utils/smartAnswers.js";
import { httpError } from "../utils/helpers.js";

// AI spending assistant. The workspace's own data is summarised into the system prompt and the
// answer is streamed back to the browser as Server-Sent Events.
// Provider chain:  Claude (ANTHROPIC_API_KEY)  ->  Google Gemini (GEMINI_API_KEY, free tier)
//                  ->  built-in rule-based "smart answers" (always available, no key needed).

const CLAUDE_MODEL = process.env.AI_MODEL || "claude-opus-5";
const GEMINI_MODELS = [process.env.GEMINI_MODEL || "gemini-flash-latest", "gemini-flash-lite-latest"];
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_HISTORY = 20;
const MAX_MESSAGE_CHARS = 4000;

export const aiProvider = () => (process.env.ANTHROPIC_API_KEY ? "claude" : process.env.GEMINI_API_KEY ? "gemini" : "basic");
export const aiConfigured = () => aiProvider() !== "basic";

let claudeClient;
const getClaude = () => (claudeClient ??= new Anthropic()); // reads ANTHROPIC_API_KEY from the environment

const INSTRUCTIONS = `You are the spending assistant inside SubTrack, a SaaS subscription and expense tracker.
Answer questions about the user's subscriptions, payments, budgets and savings using ONLY the workspace data provided below.

Guidelines:
- Be concise and specific: quote real names, amounts and dates from the data. Use the workspace's base currency for totals unless the user asks otherwise.
- When you calculate something (totals, averages, yearly cost), make sure the arithmetic matches the data.
- For "what should I cancel / how can I save" questions, weigh cost, overlap between tools in the same category, paused plans, trials and price increases, and give a short ranked list with the yearly saving of each.
- If the data doesn't contain the answer, say so plainly and suggest what the user could track to answer it next time.
- Format with short paragraphs or bullet lists (Markdown). Keep answers under about 200 words unless the user asks for detail.
- You cannot change data yourself; tell the user which page to use (Subscriptions, Expenses, Calendar, Splits, Settings).`;

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// Everything the assistant (AI or rule-based) needs about the workspace.
const loadSnapshot = async (workspace) => {
  const base = workspace.currency;
  const today = startOfToday();
  const yearAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  const [{ rates }, subscriptions, monthly, byCategory, openSplits] = await Promise.all([
    getRates(),
    Subscription.find({ workspace: workspace._id }),
    Expense.aggregate([
      { $match: { workspace: workspace._id, date: { $gte: yearAgo } } },
      { $group: { _id: { month: { $dateToString: { format: "%Y-%m", date: "$date" } }, currency: "$currency" }, total: { $sum: "$amount" } } },
    ]),
    Expense.aggregate([
      { $match: { workspace: workspace._id, date: { $gte: yearAgo } } },
      { $group: { _id: { category: "$category", currency: "$currency" }, total: { $sum: "$amount" } } },
    ]),
    Settlement.find({ workspace: workspace._id, settled: false }).lean(),
  ]);
  const toBase = (amount, currency) => round2(convert(amount, currency, base, rates));

  // Last 12 months of spend in base currency, oldest first, including empty months.
  const totals = {};
  for (const r of monthly) totals[r._id.month] = (totals[r._id.month] || 0) + toBase(r.total, r._id.currency);
  const monthlySpend = Array.from({ length: 12 }, (_, i) => {
    const key = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11 + i, 1)).toISOString().slice(0, 7);
    return { month: key, total: round2(totals[key] || 0) };
  });
  const categorySpend = {};
  for (const r of byCategory) categorySpend[r._id.category] = round2((categorySpend[r._id.category] || 0) + toBase(r.total, r._id.currency));

  return { workspace, base, rates, today, subscriptions, monthlySpend, categorySpend, openSplits, toBase };
};

// Compact JSON of the snapshot for the language model.
const contextFor = (snap, user) =>
  JSON.stringify({
    today: day(snap.today),
    user: user.name,
    workspace: {
      name: snap.workspace.name,
      baseCurrency: snap.base,
      monthlyBudget: snap.workspace.monthlyBudget,
      categoryBudgets: Object.fromEntries(snap.workspace.categoryBudgets || []),
    },
    subscriptions: snap.subscriptions.map((s) => ({
      name: s.name,
      category: s.category,
      status: s.status,
      freeTrial: s.isTrial || undefined,
      cost: s.cost,
      currency: s.currency,
      billingCycle: s.billingCycle,
      monthlyCostInBase: snap.toBase(toMonthly(s.cost, s.billingCycle), s.currency),
      nextRenewal: day(s.nextRenewal),
      pausedOrCancelledSince: s.status !== "active" ? day(s.statusChangedAt) : undefined,
      priceHistory: s.priceHistory?.length > 1 ? s.priceHistory.map((p) => ({ cost: p.cost, currency: p.currency, from: day(p.changedAt) })) : undefined,
      sharedWith: s.splitWith?.length ? s.splitWith.map((p) => `${p.name} (${p.share}%)`) : undefined,
    })),
    paymentsLast12MonthsByMonth: Object.fromEntries(snap.monthlySpend.map((m) => [m.month, m.total])),
    paymentsLast12MonthsByCategory: snap.categorySpend,
    unsettledSplits: snap.openSplits.map((s) => ({ person: s.debtorName, subscription: s.subscriptionName, amount: s.amount, currency: s.currency })),
  });

const cleanHistory = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) throw httpError(400, "Send at least one message");
  const cleaned = messages
    .slice(-MAX_HISTORY)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  while (cleaned.length && cleaned[0].role !== "user") cleaned.shift(); // conversation must start with the user
  if (!cleaned.length || cleaned.at(-1).role !== "user") throw httpError(400, "The last message must be from you");
  return cleaned;
};

// ---- Claude (Anthropic SDK) ----
const streamClaude = async ({ system, messages, signal, onText }) => {
  const stream = getClaude().beta.messages.stream(
    {
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      // If the model declines, the API automatically retries on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: system.map((text) => ({ type: "text", text })),
      messages,
    },
    { signal }
  );
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw Object.assign(new Error("refusal"), { userMessage: "The assistant can't help with that request. Try asking about your subscriptions or spending." });
  return final.model;
};

// ---- Google Gemini (REST streaming, free tier) ----
const streamGemini = async ({ system, messages, signal, onText }) => {
  let lastError;
  for (const model of GEMINI_MODELS) {
    const response = await fetch(`${GEMINI_URL}/${model}:streamGenerateContent?alt=sse`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: system.map((text) => ({ text })) },
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      lastError = Object.assign(new Error(body.error?.message || `Gemini error ${response.status}`), { status: response.status });
      if (response.status === 429 || response.status >= 500) continue; // busy or quota used: try the lighter model
      throw lastError;
    }

    // Parse the SSE stream: lines of "data: {json}"
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finishReason;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const chunk = JSON.parse(line.slice(5));
        const candidate = chunk.candidates?.[0];
        for (const part of candidate?.content?.parts || []) if (part.text && !part.thought) onText(part.text);
        finishReason = candidate?.finishReason || finishReason;
      }
    }
    if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
      throw Object.assign(new Error("blocked"), { userMessage: "The assistant can't help with that request. Try asking about your subscriptions or spending." });
    }
    return model;
  }
  throw lastError;
};

// POST /api/ai/chat  { messages: [{ role, content }] }  ->  text/event-stream (events: meta, text, error, done)
export const chat = async (req, res) => {
  const messages = cleanHistory(req.body?.messages);
  const snapshot = await loadSnapshot(req.workspace);

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // Stop generating (and using quota) if the user closes the chat mid-answer.
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });

  const provider = aiProvider();
  const system = [INSTRUCTIONS, `Workspace data (JSON):\n${contextFor(snapshot, req.user)}`];
  let sentText = false;
  const onText = (text) => {
    sentText = true;
    send("text", { text });
  };

  try {
    if (provider === "basic") {
      send("meta", { provider: "basic" });
      onText(smartAnswer(messages.at(-1).content, snapshot));
    } else {
      send("meta", { provider });
      const stream = provider === "claude" ? streamClaude : streamGemini;
      const model = await stream({ system, messages, signal: controller.signal, onText });
      send("meta", { provider, model });
    }
  } catch (err) {
    if (controller.signal.aborted || err instanceof Anthropic.APIUserAbortError) return res.end();
    if (err.userMessage) {
      send("error", { message: err.userMessage });
    } else if (!sentText) {
      // AI unavailable (quota, network, bad key): answer from the data instead of failing.
      console.error(`AI (${provider}) failed, using smart answers:`, err.message);
      send("meta", { provider: "basic", fallback: true });
      onText(`_The AI service is unavailable right now (${err.status === 429 ? "free quota reached" : "connection problem"}), so here's a quick answer from your data:_\n\n`);
      onText(smartAnswer(messages.at(-1).content, snapshot));
    } else {
      console.error(`AI (${provider}) failed mid-answer:`, err.message);
      send("error", { message: "The answer was interrupted. Please try again." });
    }
  }
  send("done", {});
  res.end();
};
