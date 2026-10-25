# SubTrack: SaaS Subscription & Expense Analytics Dashboard

A full-stack **MERN** application (MongoDB, Express, React, Node.js) for tracking the SaaS tools a person or team pays for. It records payments, analyses where the money goes, and recommends savings.

## Features

### Core
- **Subscriptions:** add, edit, delete, search, filter and sort. Supports monthly, quarterly and yearly billing.
- **Mark as paid:** records the payment as an expense and moves the renewal date forward one cycle. Month-end dates are handled correctly, so 31 Jan moves to 28 Feb.
- **Expenses:**
  - server-side pagination, sorting and filters (text, category, date range)
  - optional link to a subscription
  - **receipt/invoice upload** (PDF or image)
- **Analytics dashboard:**
  - monthly recurring cost, projected yearly cost, and this month compared with last month
  - 6-month spend trend (MongoDB aggregation pipeline)
  - recurring cost by category
  - each chart can switch to a table view
  - upcoming and overdue renewals

### Add-on features
| Feature | What it does | Concepts shown |
|---|---|---|
| **Savings insights** | Rule-based recommendations: switch to yearly billing, overlapping tools in a category, plans paused for a long time, big renewals coming up, spending spikes, budget forecast. Shows an estimated yearly saving. | Business logic, data analysis |
| **Budgets and alerts** | An overall monthly budget plus a budget per category. Members are alerted at 80% and 100%. | Aggregation, event-driven notifications |
| **Notifications bell** | In-app notifications for renewals, budgets and team invites. Unread badge, mark as read. | Polling, REST design |
| **Email renewal reminders** | A daily scheduled job emails members N days before a renewal. Each reminder is sent only once. | node-cron, Nodemailer |
| **Team workspaces** | Create a team workspace, add members by email, share subscriptions and expenses. The owner manages settings. | Multi-tenant data model, authorisation |
| **Admin panel** | Platform stats, sign-ups chart, most popular tools, user management (change role, delete user), run the reminder job on demand. | Role-based access control |
| **Multi-currency** | Each subscription or expense can use its own currency (INR, USD, EUR, GBP, AUD, CAD, SGD). Analytics convert everything to the workspace currency using live ECB exchange rates. | Third-party API, caching |
| **Renewal calendar** | Month grid and agenda of projected renewals. | Date maths, UI |
| **Export CSV / PDF** | Export subscriptions or a filtered expense report. | File generation |
| **Forgot password (email OTP)** | 6-digit code, hashed, expires in 10 minutes, limited attempts. | Secure auth flow |
| **Profile picture upload** | PNG/JPG/WEBP up to 2 MB. | Multer file uploads |
| **Dark mode** | Light, dark or follow the system setting. | Theming with CSS variables |
| **Polish** | Toast messages, loading skeletons, 404 page, code-split pages. | UX |

### Advanced features
| Feature | What it does | Concepts shown |
|---|---|---|
| **AI spending assistant** | A chat panel on every page. Ask "Which subscriptions should I cancel?" and Claude answers from your real workspace data, streamed word by word. | LLM integration (Claude API), Server-Sent Events, prompt design |
| **Real-time updates** | New notifications and teammates' changes appear instantly without refreshing (live dot in the top bar, "Priya added Figma" toasts). | WebSockets (Socket.io), JWT-authenticated sockets |
| **Auto logos** | Each subscription shows its brand logo, taken from its website. | External image service, CSP |
| **Free-trial tracker** | Mark a subscription as a trial and get a warning before the first charge. The trial converts to paid when you record the payment. | Scheduled jobs, domain modelling |
| **Price-hike detection** | Every price change is stored. Increases trigger an alert ("Netflix price went up 30%") and an insight, and the details panel shows a price-history chart. | Data history, change detection |
| **Cost splitting** | Split a subscription (e.g. a family plan) by percentage. Each payment records who owes you; settle balances, or email reminders Splitwise-style. | Relational data, aggregation |
| **12-month cash-flow forecast** | A chart of every renewal still to be paid over the next 12 months. | Predictive analytics, date maths |
| **Activity log** | An audit trail per workspace ("Demo paid DigitalOcean · 2 hours ago"), updated live. | Audit logging |
| **Monthly PDF report** | A server-generated PDF (PDFKit), emailed automatically on the 1st of each month, or downloaded or emailed on demand. | PDF generation, cron, email attachments |
| **Bulk import** | Import up to 500 subscriptions from CSV or Excel (.xlsx), with a preview and per-row error reporting. | File parsing, batch validation |
| **Two-factor authentication** | TOTP codes from Google Authenticator and similar apps, set up by QR code, with 8 one-time recovery codes. Secrets are encrypted with AES-256-GCM. | MFA, encryption at rest |
| **Installable app (PWA) + push** | Install SubTrack like a phone or desktop app. Browser push notifications arrive even when it's closed, and it works offline. | Service workers, Web Push (VAPID) |
| **Ctrl+K command palette** | Jump to any page, run actions, find a subscription or switch workspace from the keyboard. | UX, keyboard accessibility |
| **Cancellation helper** | Direct cancellation links and steps for about 25 popular services. | Product thinking |
| **Hindi / Tamil** | Language switcher for navigation, page titles, the dashboard and settings. | Internationalisation (i18n) |
| **Docker + CI** | Multi-stage Dockerfile, docker-compose with MongoDB, and GitHub Actions running the tests, the frontend build and the Docker build on every push. | DevOps |

### Security
- **JWT access token** (15 minutes, kept in memory) plus a **refresh token in an httpOnly cookie** (7 days, rotated on every refresh).
- Changing or resetting your password **logs out all other devices** (token versioning).
- Passwords hashed with **bcrypt**. Reset codes are stored hashed and compared in constant time.
- **helmet** security headers and **rate limiting** on login, register and OTP routes.
- **express-validator** checks every input. Mongoose schema validation acts as a second layer.
- Every query is scoped to the user's workspace. Receipts are only served to workspace members.
- **Optional 2FA** (TOTP) with encrypted secrets and one-time recovery codes.
- Socket.io connections require a valid JWT; the AI endpoint is rate-limited per user.
- A Content-Security-Policy that only allows our own scripts.

### Quality
- **37 automated API tests** (Jest + Supertest + in-memory MongoDB).
- **Swagger / OpenAPI docs** at `/api/docs` (48 endpoints).
- **GitHub Actions CI** and a **Docker** image.

## Tech stack

| Layer | Technology |
|---|---|
| Database | MongoDB Atlas, Mongoose |
| Backend | Node.js, Express 5, Socket.io, jsonwebtoken, bcryptjs, express-validator, helmet, express-rate-limit, multer, nodemailer, node-cron, PDFKit, otplib, web-push, Anthropic SDK (Claude), swagger-ui-express |
| Frontend | React 19 (Vite), React Router, Tailwind CSS 4, Recharts, Axios, Socket.io client, react-hot-toast, jsPDF, PapaParse, read-excel-file, lucide-react, Service Worker (PWA) |
| Testing & DevOps | Jest, Supertest, mongodb-memory-server, GitHub Actions, Docker |

## Project structure

```
FSD Project/
├── render.yaml                 # One-click deployment to Render
├── Dockerfile, docker-compose.yml
├── .github/workflows/ci.yml    # Tests + build on every push
├── server/
│   ├── app.js                  # Express app (middleware + routes)
│   ├── server.js               # Connects to MongoDB, starts the server and the cron job
│   ├── config/                 # DB connection, upload paths
│   ├── models/                 # User, Workspace, Subscription, Expense, Notification, Settlement, Activity, PushSubscription
│   ├── controllers/            # auth, 2FA, workspace, subscription, expense, analytics, notification, admin, split, activity, push, AI, report
│   ├── routes/                 # Express routers
│   ├── middleware/             # protect/adminOnly, workspace access, validation, uploads, rate limits, errors
│   ├── validators/rules.js     # express-validator rules
│   ├── utils/                  # billing maths, currency, email, insights, budgets, tokens, realtime, push, PDF report, encryption
│   ├── jobs/                   # Daily renewal/trial reminders, monthly PDF report email (node-cron)
│   ├── docs/openapi.js         # Swagger specification
│   ├── tests/api.test.js       # API test suite
│   └── seed.js                 # Demo data
└── client/src/
    ├── api/client.js           # Axios + automatic token refresh + workspace header
    ├── context/                # Auth, Workspace, Theme, Config, Realtime (Socket.io)
    ├── i18n/                   # English, Hindi, Tamil
    ├── components/             # Layout, AI assistant, command palette, NotificationBell, forms, charts, UI kit
    ├── pages/                  # Dashboard, Subscriptions, Expenses, Calendar, Splits, Team, Settings, Admin, auth pages
    └── utils/                  # formatting, constants, CSV/PDF export
```

## Getting started

### 1. Prerequisites
- Node.js 22 or later
- A free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster with:
  - a database user
  - your IP address allowed under Network Access

### 2. Install
```bash
npm run install-all
```

### 3. Configure
Copy `server/.env.example` to `server/.env` and fill in:
- `MONGO_URI`
- `JWT_SECRET` and `JWT_REFRESH_SECRET` (two different long random strings)
- optionally the `SMTP_*` settings (see [Email](#email-optional))
- optionally the keys for the advanced features (see [Optional integrations](#optional-integrations))

### 4. Load demo data
```bash
npm run seed
```
| Account | Password | Role |
|---|---|---|
| demo@subtrack.dev | demo1234 | User. Owns the personal workspace (INR) and the "Startup Team" workspace (USD). |
| priya@subtrack.dev | demo1234 | Member of "Startup Team" |
| admin@subtrack.dev | admin1234 | Admin |

The demo data includes a free trial, two price hikes, a Netflix plan split with two friends and a team activity history. Demo accounts have **email turned off**, because `@subtrack.dev` isn't a real inbox; they still get in-app notifications.

### 5. Run
```bash
npm run dev
```
- App: http://localhost:5173
- API docs: http://localhost:5000/api/docs

### 6. Test
```bash
npm test
```

## Email (optional)

Without SMTP settings, emails (reset codes, reminders, alerts) are **printed in the server terminal**, so every feature still works in a demo. To send real emails with Gmail:
1. Turn on 2-Step Verification for your Google account.
2. Create an **App password** at https://myaccount.google.com/apppasswords.
3. In `server/.env`, set:
   - `SMTP_HOST=smtp.gmail.com`
   - `SMTP_PORT=587`
   - `SMTP_USER=you@gmail.com`
   - `SMTP_PASS=<the 16-character app password>`

## Optional integrations

Each of these switches on automatically when its key is in `server/.env` (restart the server afterwards). Without a key, the feature shows a clear "not set up" message.

| Feature | Setting | How to get it |
|---|---|---|
| AI assistant | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API keys. Uses Claude Opus 5 by default (`AI_MODEL` to change). Each question costs a small amount; limited to 30 questions per user per hour. |
| Browser push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` (already generated in this project's `.env`). |

## Docker

```bash
docker compose up --build -d                 # app + MongoDB on http://localhost:5000
docker compose exec app node seed.js         # demo data
APP_PORT=8080 docker compose up --build -d   # use another port (e.g. while npm run dev uses 5000)
docker compose down                          # stop (add -v to also delete the database)
```

Optional keys (Gemini, Gmail, push, Google) are read from `server/.env`; the container always uses its own MongoDB.

> **OneDrive users:** OneDrive turns idle files into online-only placeholders that Docker can't read (`invalid file request ...`). Build from a copy outside OneDrive, e.g. `robocopy . C:\subtrack-build /E /XD node_modules dist uploads` and run `docker compose` there.

## Deployment (Render, free)

The Express server also serves the built React app, so the whole project is **one web service with one URL**.

1. Push the project to GitHub. `.env` is git-ignored.
2. In MongoDB Atlas → Network Access, allow `0.0.0.0/0`, because Render's IP addresses change.
3. In Render, choose **New → Blueprint** and pick the repository. `render.yaml` configures everything and generates the JWT secrets.
4. When asked, paste `MONGO_URI` and, optionally, the SMTP, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` and `VAPID_*` settings.
5. After the first deploy, open the Render shell and run `npm run seed --prefix server` if you want demo data.

Things to know about the free plan:
- The service sleeps after inactivity, so the first request takes about 30 seconds.
- Uploaded files are lost when the service restarts. For permanent storage, move uploads to Cloudinary or S3.

## API reference

Interactive documentation: **`/api/docs`** (Swagger UI).

All routes except register, login, refresh and password reset need `Authorization: Bearer <accessToken>`. Workspace-scoped routes use the optional `X-Workspace-Id` header.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register`, `/login` | Create an account / log in. Returns `accessToken` and sets the refresh cookie. |
| POST | `/api/auth/refresh`, `/logout` | Get a new access token / clear the cookie |
| POST | `/api/auth/forgot-password`, `/reset-password` | Email OTP reset flow |
| GET / PUT | `/api/auth/me`, `/api/auth/profile` | Current user, update name and reminder settings |
| PUT | `/api/auth/password` | Change password |
| POST / DELETE | `/api/auth/avatar` | Upload or remove profile picture |
| GET / POST | `/api/workspaces` | List / create workspaces |
| PUT / DELETE | `/api/workspaces/:id` | Update settings and budgets / delete (owner only) |
| POST / DELETE | `/api/workspaces/:id/members[/:userId]` | Add a member / remove a member or leave |
| GET / POST | `/api/subscriptions` | List (filter and sort) / create |
| GET / PUT / DELETE | `/api/subscriptions/:id` | Read / update / delete |
| POST | `/api/subscriptions/:id/pay` | Record a payment and advance the renewal date |
| GET / POST | `/api/expenses` | List (paginated, filtered, sorted) / create |
| GET | `/api/expenses/export` | All matching expenses, for CSV/PDF export |
| PUT / DELETE | `/api/expenses/:id` | Update / delete |
| GET / POST / DELETE | `/api/expenses/:id/receipt` | Download / upload / remove the receipt |
| GET | `/api/analytics/summary` | Dashboard data: trend, categories, budgets, renewals, insights |
| GET / PATCH / DELETE | `/api/notifications[...]` | List, mark read, mark all read, delete |
| GET | `/api/admin/stats`, `/api/admin/users` | Admin only |
| PATCH / DELETE | `/api/admin/users/:id` | Change a user's role / delete a user (admin only) |
| POST | `/api/admin/run-reminders` | Run the reminder job now (admin only) |
| POST | `/api/admin/run-monthly-reports` | Email last month's PDF report to everyone now (admin only) |
| GET | `/api/auth/config` | Which optional features are enabled |
| POST | `/api/auth/2fa/setup`, `/enable`, `/disable`, `/verify` | Two-factor authentication |
| POST | `/api/subscriptions/import` | Bulk import (up to 500 rows) |
| GET / PATCH / POST | `/api/splits`, `/api/splits/:id`, `/settle-all`, `/:id/remind` | Cost-splitting balances |
| GET | `/api/activity` | Workspace activity log |
| POST / DELETE | `/api/push/subscribe`, `/api/push/test` | Browser push notifications |
| POST | `/api/ai/chat` | AI assistant (Server-Sent Events stream) |
| GET / POST | `/api/reports/monthly`, `/api/reports/monthly/email` | Monthly PDF report |
| WS | `/socket.io` | Real-time events: `notification`, `data:changed` |

## Data model

- **User:** name, email, password (hashed), role (`user`/`admin`), avatar, email reminder settings, token version, hashed reset OTP
- **Workspace:** name, owner, members `[{user, role}]`, isPersonal, base currency, monthly budget, category budgets
- **Subscription:** workspace, createdBy, name, category, cost, currency, billing cycle, next renewal, status, status-changed date, payment method, website, notes, plus a virtual `monthlyCost`
- **Expense:** workspace, createdBy, title, amount, currency, category, date, linked subscription, notes, receipt file info
- **Notification:** user, workspace, type, title, message, link, read, dedupe key (unique, so the same reminder is never sent twice)
