// OpenAPI 3 description of the SubTrack REST API, rendered by Swagger UI at /api/docs.
import { BILLING_CYCLES, CATEGORIES, STATUSES } from "../utils/billing.js";
import { CURRENCIES } from "../utils/currency.js";

const json = (schema) => ({ content: { "application/json": { schema } } });
const ok = (description, schema = { type: "object" }) => ({ description, ...json(schema) });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const idPath = (name = "id") => ({ name, in: "path", required: true, schema: { type: "string" } });
const q = (name, schema = { type: "string" }, description) => ({ name, in: "query", schema, description });
const workspaceHeader = { $ref: "#/components/parameters/WorkspaceId" };
const multipart = (field) => ({
  required: true,
  content: { "multipart/form-data": { schema: { type: "object", properties: { [field]: { type: "string", format: "binary" } } } } },
});

const errors = {
  400: { description: "Validation error", ...json(ref("Error")) },
  401: { description: "Missing or invalid access token", ...json(ref("Error")) },
};

const op = (tag, summary, { responses = {}, ...extra } = {}) => ({
  tags: [tag],
  summary,
  ...extra,
  responses: { 200: ok("Success"), ...errors, ...responses },
});

const wsOp = (tag, summary, extra = {}) => op(tag, summary, { ...extra, parameters: [workspaceHeader, ...(extra.parameters || [])] });

export default {
  openapi: "3.0.3",
  info: {
    title: "SubTrack API",
    version: "3.0.0",
    description:
      "REST API for SubTrack - SaaS Subscription & Expense Analytics.\n\n" +
      "**Auth:** call `/auth/login`, copy `accessToken`, click **Authorize** and paste it. " +
      "The access token lasts 15 minutes; `/auth/refresh` issues a new one using the httpOnly refresh cookie.\n\n" +
      "**Workspaces:** send `X-Workspace-Id` to choose which workspace's data you are working with (defaults to your personal workspace).",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    parameters: {
      WorkspaceId: { name: "X-Workspace-Id", in: "header", required: false, schema: { type: "string" }, description: "Workspace to use" },
    },
    schemas: {
      Error: { type: "object", properties: { message: { type: "string" } } },
      Credentials: {
        type: "object",
        required: ["email", "password"],
        properties: { email: { type: "string", example: "demo@subtrack.dev" }, password: { type: "string", example: "demo1234" } },
      },
      Register: {
        type: "object",
        required: ["name", "email", "password"],
        properties: { name: { type: "string" }, email: { type: "string" }, password: { type: "string", minLength: 6 } },
      },
      Subscription: {
        type: "object",
        required: ["name", "cost", "nextRenewal"],
        properties: {
          name: { type: "string", example: "Notion" },
          cost: { type: "number", example: 800 },
          currency: { type: "string", enum: CURRENCIES },
          billingCycle: { type: "string", enum: BILLING_CYCLES },
          category: { type: "string", enum: CATEGORIES },
          status: { type: "string", enum: STATUSES },
          nextRenewal: { type: "string", format: "date", example: "2026-11-01" },
          paymentMethod: { type: "string" },
          website: { type: "string" },
          notes: { type: "string" },
        },
      },
      Expense: {
        type: "object",
        required: ["title", "amount", "date"],
        properties: {
          title: { type: "string", example: "Domain renewal" },
          amount: { type: "number", example: 1150 },
          currency: { type: "string", enum: CURRENCIES },
          category: { type: "string", enum: CATEGORIES },
          date: { type: "string", format: "date" },
          subscription: { type: "string", description: "Optional linked subscription id" },
          notes: { type: "string" },
        },
      },
      Workspace: {
        type: "object",
        properties: {
          name: { type: "string" },
          currency: { type: "string", enum: CURRENCIES },
          monthlyBudget: { type: "number" },
          categoryBudgets: { type: "object", additionalProperties: { type: "number" }, example: { Design: 2000 } },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/auth/register": { post: op("Auth", "Create an account (also creates a personal workspace)", { security: [], requestBody: json(ref("Register")) }) },
    "/auth/login": { post: op("Auth", "Log in - returns an access token and sets the refresh cookie", { security: [], requestBody: json(ref("Credentials")) }) },
    "/auth/refresh": { post: op("Auth", "Get a new access token using the refresh cookie", { security: [] }) },
    "/auth/logout": { post: op("Auth", "Clear the refresh cookie", { security: [] }) },
    "/auth/forgot-password": {
      post: op("Auth", "Email a 6-digit reset code", { security: [], requestBody: json({ type: "object", properties: { email: { type: "string" } } }) }),
    },
    "/auth/reset-password": {
      post: op("Auth", "Reset the password with the emailed code", {
        security: [],
        requestBody: json({ type: "object", properties: { email: { type: "string" }, otp: { type: "string" }, password: { type: "string" } } }),
      }),
    },
    "/auth/me": { get: op("Auth", "Current user") },
    "/auth/profile": {
      put: op("Auth", "Update name and reminder preferences", {
        requestBody: json({ type: "object", properties: { name: { type: "string" }, emailReminders: { type: "boolean" }, reminderDays: { type: "integer" } } }),
      }),
    },
    "/auth/password": {
      put: op("Auth", "Change password (logs out other devices)", {
        requestBody: json({ type: "object", properties: { currentPassword: { type: "string" }, newPassword: { type: "string" } } }),
      }),
    },
    "/auth/avatar": { post: op("Auth", "Upload a profile picture (PNG/JPG/WEBP, max 2 MB)", { requestBody: multipart("avatar") }), delete: op("Auth", "Remove the profile picture") },

    "/workspaces": { get: op("Workspaces", "Workspaces you belong to"), post: op("Workspaces", "Create a team workspace", { requestBody: json(ref("Workspace")) }) },
    "/workspaces/{id}": {
      put: op("Workspaces", "Update name, currency and budgets (owner)", { parameters: [idPath()], requestBody: json(ref("Workspace")) }),
      delete: op("Workspaces", "Delete a team workspace and its data (owner)", { parameters: [idPath()] }),
    },
    "/workspaces/{id}/members": {
      post: op("Workspaces", "Add a member by email (owner)", { parameters: [idPath()], requestBody: json({ type: "object", properties: { email: { type: "string" } } }) }),
    },
    "/workspaces/{id}/members/{userId}": { delete: op("Workspaces", "Remove a member, or leave the workspace", { parameters: [idPath(), idPath("userId")] }) },

    "/subscriptions": {
      get: wsOp("Subscriptions", "List subscriptions", {
        parameters: [q("q"), q("status", { type: "string", enum: STATUSES }), q("category", { type: "string", enum: CATEGORIES }), q("sort"), q("order", { type: "string", enum: ["asc", "desc"] })],
      }),
      post: wsOp("Subscriptions", "Create a subscription", { requestBody: json(ref("Subscription")) }),
    },
    "/subscriptions/{id}": {
      get: wsOp("Subscriptions", "Get one subscription", { parameters: [idPath()] }),
      put: wsOp("Subscriptions", "Update a subscription", { parameters: [idPath()], requestBody: json(ref("Subscription")) }),
      delete: wsOp("Subscriptions", "Delete a subscription", { parameters: [idPath()] }),
    },
    "/subscriptions/{id}/pay": { post: wsOp("Subscriptions", "Record a renewal payment and advance the renewal date", { parameters: [idPath()] }) },

    "/expenses": {
      get: wsOp("Expenses", "List expenses (paginated)", {
        parameters: [q("q"), q("category"), q("from", { type: "string", format: "date" }), q("to", { type: "string", format: "date" }), q("page", { type: "integer" }), q("limit", { type: "integer" }), q("sort"), q("order")],
      }),
      post: wsOp("Expenses", "Create an expense", { requestBody: json(ref("Expense")) }),
    },
    "/expenses/export": { get: wsOp("Expenses", "All matching expenses for CSV/PDF export", { parameters: [q("q"), q("category"), q("from"), q("to")] }) },
    "/expenses/{id}": {
      put: wsOp("Expenses", "Update an expense", { parameters: [idPath()], requestBody: json(ref("Expense")) }),
      delete: wsOp("Expenses", "Delete an expense", { parameters: [idPath()] }),
    },
    "/expenses/{id}/receipt": {
      get: wsOp("Expenses", "Download the attached receipt", { parameters: [idPath()] }),
      post: wsOp("Expenses", "Attach a receipt (PDF/PNG/JPG/WEBP, max 5 MB)", { parameters: [idPath()], requestBody: multipart("receipt") }),
      delete: wsOp("Expenses", "Remove the receipt", { parameters: [idPath()] }),
    },

    "/analytics/summary": { get: wsOp("Analytics", "Dashboard numbers, trend, categories, budgets, renewals and savings insights") },

    "/notifications": { get: op("Notifications", "Latest notifications and unread count") },
    "/notifications/read-all": { patch: op("Notifications", "Mark all as read") },
    "/notifications/{id}/read": { patch: op("Notifications", "Mark one as read", { parameters: [idPath()] }) },
    "/notifications/{id}": { delete: op("Notifications", "Delete a notification", { parameters: [idPath()] }) },

    "/admin/stats": { get: op("Admin", "Platform statistics (admin only)", { responses: { 403: ok("Not an admin", ref("Error")) } }) },
    "/admin/users": { get: op("Admin", "All users (admin only)", { parameters: [q("q"), q("page", { type: "integer" }), q("limit", { type: "integer" })] }) },
    "/admin/users/{id}": {
      patch: op("Admin", "Change a user's role (admin only)", {
        parameters: [idPath()],
        requestBody: json({ type: "object", properties: { role: { type: "string", enum: ["user", "admin"] } } }),
      }),
      delete: op("Admin", "Delete a user and their data (admin only)", { parameters: [idPath()] }),
    },
    "/admin/run-reminders": { post: op("Admin", "Run the renewal reminder job now (admin only)") },
    "/admin/run-monthly-reports": { post: op("Admin", "Email last month's PDF report to everyone now (admin only)") },

    "/auth/config": { get: op("Auth", "Which optional features are enabled (push notifications, AI)", { security: [] }) },
    "/auth/2fa/setup": { post: op("Two-factor auth", "Start 2FA setup - returns a QR code and secret") },
    "/auth/2fa/enable": {
      post: op("Two-factor auth", "Confirm a code to turn 2FA on - returns recovery codes once", { requestBody: json({ type: "object", properties: { code: { type: "string" } } }) }),
    },
    "/auth/2fa/disable": {
      post: op("Two-factor auth", "Turn 2FA off (needs password and a code)", {
        requestBody: json({ type: "object", properties: { password: { type: "string" }, code: { type: "string" } } }),
      }),
    },
    "/auth/2fa/verify": {
      post: op("Two-factor auth", "Second login step: exchange tempToken + code for a session", {
        security: [],
        requestBody: json({ type: "object", properties: { tempToken: { type: "string" }, code: { type: "string" } } }),
      }),
    },

    "/subscriptions/import": {
      post: wsOp("Subscriptions", "Bulk import up to 500 subscriptions (rows parsed from CSV/Excel)", {
        requestBody: json({ type: "object", properties: { items: { type: "array", items: ref("Subscription") } } }),
      }),
    },

    "/splits": { get: wsOp("Cost splitting", "Who owes what: balances per person and all shares") },
    "/splits/{id}": {
      patch: wsOp("Cost splitting", "Mark a share settled or unsettled", { parameters: [idPath()], requestBody: json({ type: "object", properties: { settled: { type: "boolean" } } }) }),
    },
    "/splits/settle-all": {
      post: wsOp("Cost splitting", "Settle everything one person owes", {
        requestBody: json({ type: "object", properties: { debtorName: { type: "string" }, currency: { type: "string" } } }),
      }),
    },
    "/splits/{id}/remind": { post: wsOp("Cost splitting", "Email the person a reminder", { parameters: [idPath()] }) },

    "/activity": { get: wsOp("Activity", "Workspace audit trail (who did what)", { parameters: [q("page", { type: "integer" }), q("limit", { type: "integer" })] }) },

    "/push/subscribe": {
      post: op("Push notifications", "Save this browser's push subscription", {
        requestBody: json({ type: "object", properties: { endpoint: { type: "string" }, keys: { type: "object" } } }),
      }),
      delete: op("Push notifications", "Remove this browser's push subscription"),
    },
    "/push/test": { post: op("Push notifications", "Send a test push to all your devices") },

    "/ai/chat": {
      post: wsOp("AI assistant", "Ask about your spending - streams the answer as Server-Sent Events", {
        requestBody: json({
          type: "object",
          properties: { messages: { type: "array", items: { type: "object", properties: { role: { type: "string", enum: ["user", "assistant"] }, content: { type: "string" } } } } },
        }),
        responses: { 200: { description: "text/event-stream of `text`, `error` and `done` events" }, 503: ok("AI key not configured", ref("Error")) },
      }),
    },

    "/reports/monthly": { get: wsOp("Reports", "Download a month's PDF report", { parameters: [q("month", { type: "string", example: "2026-09" })] }) },
    "/reports/monthly/email": {
      post: wsOp("Reports", "Email a month's PDF report to yourself", { requestBody: json({ type: "object", properties: { month: { type: "string", example: "2026-09" } } }) }),
    },
  },
};
