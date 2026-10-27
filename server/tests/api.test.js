// End-to-end API tests: a real Express app talking to a throwaway in-memory MongoDB.
// Run with: npm test
import { jest } from "@jest/globals";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(60000);

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.RATES_OFFLINE = "true";

let mongo, app, outbox, User, Notification;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("subtrack-test"));
  ({ default: app } = await import("../app.js"));
  ({ outbox } = await import("../utils/email.js"));
  ({ default: User } = await import("../models/User.js"));
  ({ default: Notification } = await import("../models/Notification.js"));
  await Notification.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const api = () => request(app);
const auth = (token, workspaceId) => ({
  Authorization: `Bearer ${token}`,
  ...(workspaceId && { "X-Workspace-Id": workspaceId }),
});

const registerUser = async (name, email, password = "secret123") => {
  const res = await api().post("/api/auth/register").send({ name, email, password });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken, user: res.body.user, cookie: res.headers["set-cookie"] };
};

describe("Authentication", () => {
  let alice;

  test("register returns an access token, sets an httpOnly refresh cookie and hides the password", async () => {
    alice = await registerUser("Alice", "alice@test.com");
    expect(alice.token).toBeTruthy();
    expect(alice.user.password).toBeUndefined();
    expect(alice.cookie.join(";")).toMatch(/refreshToken=.*HttpOnly/i);
  });

  test("every user gets a personal workspace, even accounts created before workspaces existed", async () => {
    const { default: Workspace } = await import("../models/Workspace.js");
    await Workspace.deleteMany({ owner: alice.user._id });
    const res = await api().get("/api/workspaces").set(auth(alice.token));
    expect(res.body).toHaveLength(1);
    expect(res.body[0].isPersonal).toBe(true);
    expect(res.body[0].myRole).toBe("owner");
  });

  test("rejects duplicate email, short password and invalid email", async () => {
    expect((await api().post("/api/auth/register").send({ name: "A", email: "alice@test.com", password: "secret123" })).status).toBe(409);
    const short = await api().post("/api/auth/register").send({ name: "B", email: "b@test.com", password: "123" });
    expect(short.status).toBe(400);
    expect(short.body.message).toMatch(/6-128 characters/);
    expect((await api().post("/api/auth/register").send({ name: "C", email: "not-an-email", password: "secret123" })).status).toBe(400);
  });

  test("login is case-insensitive on email and rejects a wrong password", async () => {
    expect((await api().post("/api/auth/login").send({ email: "ALICE@test.com", password: "secret123" })).status).toBe(200);
    expect((await api().post("/api/auth/login").send({ email: "alice@test.com", password: "nope123" })).status).toBe(401);
  });

  test("protected routes need a valid token", async () => {
    expect((await api().get("/api/auth/me")).status).toBe(401);
    expect((await api().get("/api/auth/me").set(auth("garbage"))).status).toBe(401);
    expect((await api().get("/api/auth/me").set(auth(alice.token))).body.user.email).toBe("alice@test.com");
  });

  test("refresh cookie issues a new access token; logout clears it", async () => {
    const res = await api().post("/api/auth/refresh").set("Cookie", alice.cookie);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect((await api().post("/api/auth/refresh")).status).toBe(401);
    const out = await api().post("/api/auth/logout");
    expect(out.headers["set-cookie"].join(";")).toMatch(/refreshToken=;/);
  });

  test("forgot/reset password with emailed OTP, and old refresh tokens stop working", async () => {
    const before = outbox.length;
    await api().post("/api/auth/forgot-password").send({ email: "alice@test.com" }).expect(200);
    const unknown = await api().post("/api/auth/forgot-password").send({ email: "nobody@test.com" });
    expect(unknown.status).toBe(200); // same answer for unknown emails
    expect(outbox.length).toBe(before + 1);

    const otp = outbox.at(-1).text.match(/\b(\d{6})\b/)[1];
    const wrong = otp === "000000" ? "111111" : "000000";
    expect((await api().post("/api/auth/reset-password").send({ email: "alice@test.com", otp: wrong, password: "newpass1" })).status).toBe(400);
    await api().post("/api/auth/reset-password").send({ email: "alice@test.com", otp, password: "newpass1" }).expect(200);

    expect((await api().post("/api/auth/login").send({ email: "alice@test.com", password: "newpass1" })).status).toBe(200);
    expect((await api().post("/api/auth/refresh").set("Cookie", alice.cookie)).status).toBe(401);
  });
});

describe("Subscriptions, expenses and analytics", () => {
  let token;

  beforeAll(async () => {
    ({ token } = await registerUser("Bob", "bob@test.com"));
  });

  test("creates subscriptions in mixed currencies and converts to the workspace currency", async () => {
    const inr = await api().post("/api/subscriptions").set(auth(token)).send({ name: "Notion", cost: 1200, billingCycle: "yearly", category: "Productivity", nextRenewal: "2027-01-31" });
    expect(inr.status).toBe(201);
    expect(inr.body.monthlyCost).toBe(100);
    expect(inr.body.currency).toBe("INR");

    await api().post("/api/subscriptions").set(auth(token)).send({ name: "Figma", cost: 15, currency: "USD", category: "Design", nextRenewal: "2027-01-10" }).expect(201);

    const list = await api().get("/api/subscriptions?sort=name&order=asc").set(auth(token));
    expect(list.body.map((s) => s.name)).toEqual(["Figma", "Notion"]);
    expect(list.body[0].monthlyCostBase).toBeGreaterThan(1000); // 15 USD is well over 1000 INR
  });

  test("validates input", async () => {
    const res = await api().post("/api/subscriptions").set(auth(token)).send({ name: "", cost: -5, nextRenewal: "nope", category: "Nope", currency: "XYZ" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Name is required/);
    expect(res.body.message).toMatch(/Unsupported currency/);
    expect((await api().get("/api/subscriptions/not-an-id").set(auth(token))).status).toBe(400);
  });

  test("month maths clamps to the end of the month (31 Jan + 1 month = 28 Feb)", async () => {
    const { addMonths } = await import("../utils/billing.js");
    expect(addMonths(new Date("2027-01-31"), 1).toISOString()).toMatch(/^2027-02-28/);
    expect(addMonths(new Date("2028-01-31"), 1).toISOString()).toMatch(/^2028-02-29/);
  });

  test("mark as paid only opens 3 days before renewal, then emails a confirmation and locks until next time", async () => {
    const [notion] = (await api().get("/api/subscriptions?q=notion").set(auth(token))).body;

    // Renewal is months away: too early to pay.
    const early = await api().post(`/api/subscriptions/${notion._id}/pay`).set(auth(token));
    expect(early.status).toBe(400);
    expect(early.body.message).toMatch(/can be marked as paid from .* \(3 days before it renews\)/);

    // Renewal in 2 days: allowed.
    const dueSoon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await api().put(`/api/subscriptions/${notion._id}`).set(auth(token)).send({ billingCycle: "monthly", cost: 100, nextRenewal: dueSoon }).expect(200);
    const before = outbox.length;
    const res = await api().post(`/api/subscriptions/${notion._id}/pay`).set(auth(token)).expect(201);
    expect(res.body.expense.subscription).toBe(notion._id);
    expect(res.body.subscription.nextRenewal.slice(0, 10)).not.toBe(dueSoon);
    expect(new Date(res.body.paymentOpensOn) > new Date()).toBe(true);

    const email = outbox.slice(before).find((m) => m.subject === "Notion renewed");
    expect(email?.to).toBe("bob@test.com");
    expect(email.text).toMatch(/Next renewal:/);
    const notes = await api().get("/api/notifications").set(auth(token));
    expect(notes.body.items.some((n) => n.type === "payment" && n.title === "Notion renewed")).toBe(true);

    // Paying again straight away is blocked until 3 days before the new renewal date.
    expect((await api().post(`/api/subscriptions/${notion._id}/pay`).set(auth(token))).status).toBe(400);
  });

  test("expenses are paginated, sortable and filterable", async () => {
    for (let i = 1; i <= 12; i++) {
      await api().post("/api/expenses").set(auth(token)).send({ title: `Item ${i}`, amount: i * 10, date: "2026-09-15", category: "Other" }).expect(201);
    }
    const page1 = await api().get("/api/expenses?limit=5&sort=amount&order=desc").set(auth(token));
    expect(page1.body.items).toHaveLength(5);
    expect(page1.body.total).toBe(13);
    expect(page1.body.pages).toBe(3);
    expect(page1.body.items[0].amount).toBe(120);

    const filtered = await api().get("/api/expenses?q=Item 1&from=2026-09-01&to=2026-09-30").set(auth(token));
    expect(filtered.body.total).toBe(4); // Item 1, 10, 11, 12
    const exported = await api().get("/api/expenses/export?category=Other").set(auth(token));
    expect(exported.body.items).toHaveLength(12);
  });

  test("receipts can be uploaded, downloaded and are type-checked", async () => {
    const { body } = await api().get("/api/expenses?limit=1").set(auth(token));
    const id = body.items[0]._id;
    const bad = await api().post(`/api/expenses/${id}/receipt`).set(auth(token)).attach("receipt", Buffer.from("hello"), { filename: "x.txt", contentType: "text/plain" });
    expect(bad.status).toBe(400);
    const good = await api().post(`/api/expenses/${id}/receipt`).set(auth(token)).attach("receipt", Buffer.from("%PDF-1.4 test"), { filename: "invoice.pdf", contentType: "application/pdf" });
    expect(good.status).toBe(200);
    expect(good.body.receipt.originalName).toBe("invoice.pdf");
    const file = await api().get(`/api/expenses/${id}/receipt`).set(auth(token)).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toMatch(/pdf/);
    expect(file.body.toString()).toBe("%PDF-1.4 test"); // stored in MongoDB, not on disk
    const { default: StoredFile } = await import("../models/StoredFile.js");
    expect(await StoredFile.countDocuments({ _id: good.body.receipt.filename })).toBe(1);
    await api().delete(`/api/expenses/${id}`).set(auth(token)).expect(200);
    expect(await StoredFile.countDocuments({ _id: good.body.receipt.filename })).toBe(0);
  });

  test("profile pictures are stored in MongoDB and served publicly", async () => {
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const up = await api().post("/api/auth/avatar").set(auth(token)).attach("avatar", png, { filename: "me.png", contentType: "image/png" }).expect(200);
    expect(up.body.user.avatar).toMatch(/^\/uploads\/avatars\/[a-f0-9]{24}$/);
    const img = await api().get(up.body.user.avatar).expect(200);
    expect(img.headers["content-type"]).toMatch(/png/);
    expect(img.headers["cache-control"]).toMatch(/max-age/);
    await api().delete("/api/auth/avatar").set(auth(token)).expect(200);
    expect((await api().get(up.body.user.avatar)).status).toBe(404);
    expect((await api().get("/uploads/avatars/not-an-id")).status).toBe(404);
  });

  test("analytics summary includes trend, categories, insights and budgets", async () => {
    const workspaces = (await api().get("/api/workspaces").set(auth(token))).body;
    await api()
      .put(`/api/workspaces/${workspaces[0]._id}`)
      .set(auth(token))
      .send({ monthlyBudget: 500, categoryBudgets: { Design: 100 } })
      .expect(200);

    const res = await api().get("/api/analytics/summary").set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.trend).toHaveLength(6);
    expect(res.body.activeCount).toBe(2);
    expect(res.body.byCategory.map((c) => c.category)).toContain("Design");
    expect(res.body.insights.some((i) => i.id === "switch-yearly")).toBe(true);
    expect(res.body.budgets.map((b) => b.label)).toEqual(["Overall", "Design"]);
  });
});

describe("Shared workspaces", () => {
  let owner, member, outsider, teamId;

  beforeAll(async () => {
    owner = await registerUser("Owner", "owner@test.com");
    member = await registerUser("Member", "member@test.com");
    outsider = await registerUser("Outsider", "outsider@test.com");
  });

  test("owner creates a team workspace and adds a member, who gets a notification", async () => {
    const ws = await api().post("/api/workspaces").set(auth(owner.token)).send({ name: "Team", currency: "USD" });
    expect(ws.status).toBe(201);
    teamId = ws.body._id;

    await api().post(`/api/workspaces/${teamId}/members`).set(auth(owner.token)).send({ email: "member@test.com" }).expect(201);
    expect((await api().post(`/api/workspaces/${teamId}/members`).set(auth(owner.token)).send({ email: "ghost@test.com" })).status).toBe(404);

    const notes = await api().get("/api/notifications").set(auth(member.token));
    expect(notes.body.unread).toBe(1);
    expect(notes.body.items[0].title).toMatch(/added to Team/);
  });

  test("members share data; outsiders can't see it", async () => {
    await api().post("/api/subscriptions").set(auth(owner.token, teamId)).send({ name: "Linear", cost: 40, nextRenewal: "2026-12-01" }).expect(201);
    const asMember = await api().get("/api/subscriptions").set(auth(member.token, teamId));
    expect(asMember.body.map((s) => s.name)).toEqual(["Linear"]);
    expect(asMember.body[0].currency).toBe("USD");

    // The outsider's header is ignored and they fall back to their own (empty) workspace.
    const asOutsider = await api().get("/api/subscriptions").set(auth(outsider.token, teamId));
    expect(asOutsider.body).toEqual([]);
  });

  test("only the owner can change settings; members can leave", async () => {
    expect((await api().put(`/api/workspaces/${teamId}`).set(auth(member.token)).send({ name: "Hacked" })).status).toBe(403);
    await api().delete(`/api/workspaces/${teamId}/members/${member.user._id}`).set(auth(member.token)).expect(200);
    const after = await api().get("/api/subscriptions").set(auth(member.token, teamId));
    expect(after.body).toEqual([]);
  });

  test("budget alerts notify members when 80% is reached", async () => {
    await api().put(`/api/workspaces/${teamId}`).set(auth(owner.token)).send({ monthlyBudget: 100 }).expect(200);
    const today = new Date().toISOString().slice(0, 10);
    await api().post("/api/expenses").set(auth(owner.token, teamId)).send({ title: "Big tool", amount: 85, date: today }).expect(201);
    const notes = await api().get("/api/notifications").set(auth(owner.token));
    expect(notes.body.items.some((n) => n.type === "budget" && /85% used/.test(n.title))).toBe(true);
  });
});

describe("Admin", () => {
  let user, admin;

  beforeAll(async () => {
    user = await registerUser("Regular", "regular@test.com");
    admin = await registerUser("Boss", "boss@test.com");
    await User.updateOne({ _id: admin.user._id }, { role: "admin" });
  });

  test("regular users get 403 on admin routes", async () => {
    expect((await api().get("/api/admin/stats").set(auth(user.token))).status).toBe(403);
  });

  test("admins see platform stats, users and can change roles", async () => {
    const stats = await api().get("/api/admin/stats").set(auth(admin.token));
    expect(stats.status).toBe(200);
    expect(stats.body.users).toBeGreaterThanOrEqual(7);
    expect(stats.body.signups).toHaveLength(6);

    const users = await api().get("/api/admin/users?q=regular").set(auth(admin.token));
    expect(users.body.items).toHaveLength(1);

    await api().patch(`/api/admin/users/${user.user._id}`).set(auth(admin.token)).send({ role: "admin" }).expect(200);
    expect((await api().patch(`/api/admin/users/${admin.user._id}`).set(auth(admin.token)).send({ role: "user" })).status).toBe(400);
  });

  test("adding a subscription that renews soon sends a reminder immediately, and only once", async () => {
    const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const before = outbox.length;
    await api().post("/api/subscriptions").set(auth(admin.token)).send({ name: "Due soon", cost: 5, nextRenewal: soon }).expect(201);

    const notes = await api().get("/api/notifications").set(auth(admin.token));
    expect(notes.body.items.filter((n) => n.title.startsWith("Due soon renews in"))).toHaveLength(1);
    expect(outbox.slice(before).some((m) => m.to === "boss@test.com" && /Due soon renews in/.test(m.subject))).toBe(true);

    // The daily job must not send the same reminder again.
    const run = await api().post("/api/admin/run-reminders").set(auth(admin.token));
    expect(run.body.checked).toBeGreaterThanOrEqual(1);
    expect(run.body.notificationsCreated).toBe(0);
  });

  test("renewals outside the reminder window are not announced", async () => {
    const later = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    await api().post("/api/subscriptions").set(auth(admin.token)).send({ name: "Far away", cost: 5, nextRenewal: later }).expect(201);
    const notes = await api().get("/api/notifications").set(auth(admin.token));
    expect(notes.body.items.some((n) => n.title.startsWith("Far away"))).toBe(false);
  });

  test("admin can delete a user and their data", async () => {
    await api().delete(`/api/admin/users/${user.user._id}`).set(auth(admin.token)).expect(200);
    expect((await api().post("/api/auth/login").send({ email: "regular@test.com", password: "secret123" })).status).toBe(401);
  });
});

describe("API docs", () => {
  test("Swagger UI is served", async () => {
    const res = await api().get("/api/docs/");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/swagger/i);
  });
});

describe("Trials, price hikes, cost splitting, import, activity and forecast", () => {
  let token, wsId;
  const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  beforeAll(async () => {
    ({ token } = await registerUser("Meera", "meera@test.com"));
    wsId = (await api().get("/api/workspaces").set(auth(token))).body[0]._id;
  });

  test("a free trial ending soon triggers a trial warning and an insight", async () => {
    await api().post("/api/subscriptions").set(auth(token)).send({ name: "Canva Pro", cost: 500, isTrial: true, nextRenewal: inDays(2) }).expect(201);
    const notes = (await api().get("/api/notifications").set(auth(token))).body.items;
    expect(notes.some((n) => n.type === "trial" && n.title === "Free trial of Canva Pro ends in 2 days")).toBe(true);
    const summary = (await api().get("/api/analytics/summary").set(auth(token))).body;
    expect(summary.insights.some((i) => i.id.startsWith("trial-"))).toBe(true);
  });

  test("raising a price records history, alerts members and shows as an insight", async () => {
    const sub = (await api().post("/api/subscriptions").set(auth(token)).send({ name: "Netflix", cost: 500, nextRenewal: inDays(20) })).body;
    await api().put(`/api/subscriptions/${sub._id}`).set(auth(token)).send({ cost: 650 }).expect(200);
    const detail = (await api().get(`/api/subscriptions/${sub._id}`).set(auth(token))).body;
    expect(detail.priceHistory.map((p) => p.cost)).toEqual([500, 650]);
    expect(detail.lastPriceChange.percent).toBe(30);
    const notes = (await api().get("/api/notifications").set(auth(token))).body.items;
    expect(notes.some((n) => n.type === "price" && n.title === "Netflix price went up 30%")).toBe(true);
    const summary = (await api().get("/api/analytics/summary").set(auth(token))).body;
    expect(summary.insights.some((i) => i.title === "Netflix price went up 30%")).toBe(true);
  });

  test("cost splitting: shares must leave something for you, payment creates balances and emails", async () => {
    const tooMuch = await api().post("/api/subscriptions").set(auth(token)).send({
      name: "Bad split", cost: 100, nextRenewal: inDays(1), splitWith: [{ name: "A", share: 60 }, { name: "B", share: 40 }],
    });
    expect(tooMuch.status).toBe(400);

    const sub = (
      await api().post("/api/subscriptions").set(auth(token)).send({
        name: "Spotify Family",
        cost: 200,
        nextRenewal: inDays(1),
        splitWith: [{ name: "Ravi", email: "ravi@test.com", share: 25 }, { name: "Anu", share: 25 }],
      })
    ).body;
    const before = outbox.length;
    const paid = await api().post(`/api/subscriptions/${sub._id}/pay`).set(auth(token)).expect(201);
    expect(paid.body.settlements.map((s) => s.amount)).toEqual([50, 50]);
    expect(outbox.slice(before).some((m) => m.to === "ravi@test.com" && /Your share of Spotify Family/.test(m.subject))).toBe(true);

    const splits = (await api().get("/api/splits").set(auth(token))).body;
    expect(splits.balances.map((b) => `${b.debtorName}:${b.amount}`).sort()).toEqual(["Anu:50", "Ravi:50"]);

    const ravi = splits.items.find((s) => s.debtorName === "Ravi");
    expect((await api().post(`/api/splits/${ravi._id}/remind`).set(auth(token))).status).toBe(200);
    const anu = splits.items.find((s) => s.debtorName === "Anu");
    expect((await api().post(`/api/splits/${anu._id}/remind`).set(auth(token))).status).toBe(400); // no email saved
    await api().patch(`/api/splits/${ravi._id}`).set(auth(token)).send({ settled: true }).expect(200);
    await api().post("/api/splits/settle-all").set(auth(token)).send({ debtorName: "anu", currency: "INR" }).expect(200);
    expect((await api().get("/api/splits").set(auth(token))).body.balances).toEqual([]);
  });

  test("people added to a split are emailed their share; later changes email only those affected", async () => {
    const mailsTo = (before, to) => outbox.slice(before).filter((m) => m.to === to);

    // Created with one emailed person and one without email
    let before = outbox.length;
    const created = await api().post("/api/subscriptions").set(auth(token)).send({
      name: "YouTube Family",
      cost: 300,
      billingCycle: "monthly",
      nextRenewal: inDays(20),
      splitWith: [{ name: "Kavya", email: "kavya@test.com", share: 25 }, { name: "Arjun", share: 25 }],
    });
    expect(created.status).toBe(201);
    expect(created.body.splitEmailsSent).toBe(1);
    const [added] = mailsTo(before, "kavya@test.com");
    expect(added.subject).toBe("Meera added you to the YouTube Family cost split: you pay ₹75.00 per month");
    expect(added.text).toMatch(/Your share: 25% = ₹75\.00 per month/);
    expect(added.text).toMatch(/Pay to: Meera \(meera@test\.com\)/);

    // The creator gets a copy: price, next charge and everyone's share (and a bell notification)
    const [copy] = mailsTo(before, "meera@test.com");
    expect(copy.subject).toBe("You added YouTube Family");
    expect(copy.text).toMatch(/₹300\.00 per month/);
    expect(copy.text).toMatch(/You: 50% = ₹150\.00 per month/);
    expect(copy.text).toMatch(/Kavya: 25% = ₹75\.00 per month \(emailed at kavya@test\.com\)/);
    expect(copy.text).toMatch(/Arjun: 25% = ₹75\.00 per month$/m);
    const bell = (await api().get("/api/notifications").set(auth(token))).body.items;
    expect(bell.some((n) => n.type === "split" && n.title === "You added YouTube Family")).toBe(true);

    // Adding a second emailed person only emails that person
    before = outbox.length;
    const id = created.body._id;
    let res = await api().put(`/api/subscriptions/${id}`).set(auth(token)).send({
      splitWith: [{ name: "Kavya", email: "kavya@test.com", share: 25 }, { name: "Arjun", share: 25 }, { name: "Ravi", email: "ravi2@test.com", share: 20 }],
    });
    expect(res.body.splitEmailsSent).toBe(1);
    expect(mailsTo(before, "ravi2@test.com")[0].subject).toMatch(/added you to the YouTube Family cost split: you pay ₹60\.00 per month/);
    expect(mailsTo(before, "kavya@test.com")).toHaveLength(0);

    // A price change emails everyone with an email about their new amount
    before = outbox.length;
    res = await api().put(`/api/subscriptions/${id}`).set(auth(token)).send({ cost: 400 });
    expect(res.body.splitEmailsSent).toBe(2);
    const kavyaUpdate = mailsTo(before, "kavya@test.com")[0];
    expect(kavyaUpdate.subject).toBe("Your share of YouTube Family has changed: ₹100.00 per month");
    expect(kavyaUpdate.text).toMatch(/Before: 25% = ₹75\.00 per month/);

    // Editing something unrelated (notes) sends nothing
    before = outbox.length;
    res = await api().put(`/api/subscriptions/${id}`).set(auth(token)).send({ notes: "family plan" });
    expect(res.body.splitEmailsSent).toBe(0);
    expect(outbox.length).toBe(before);

    // The Splits page lists the shared subscription and everyone's share before anything is paid
    const splits = (await api().get("/api/splits").set(auth(token))).body;
    const youtube = splits.shared.find((s) => s.name === "YouTube Family");
    expect(youtube.people.map((p) => `${p.name}:${p.amount}`)).toEqual(["Kavya:100", "Arjun:100", "Ravi:80"]);
    expect(youtube.yourShare).toEqual({ share: 30, amount: 120 });
  });

  test("bulk import saves valid rows and reports invalid ones by row number", async () => {
    const res = await api()
      .post("/api/subscriptions/import")
      .set(auth(token))
      .send({
        items: [
          { name: "Zoom", cost: 1300, billingCycle: "monthly", category: "Communication", nextRenewal: inDays(10) },
          { name: "Broken", cost: -1, nextRenewal: inDays(10) },
          { name: "Dropbox", cost: 9.99, currency: "USD", billingCycle: "monthly", category: "Productivity", nextRenewal: inDays(15) },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2);
    expect(res.body.errors).toEqual([expect.objectContaining({ row: 2, name: "Broken" })]);
  });

  test("activity log records who did what", async () => {
    const res = await api().get("/api/activity?limit=50").set(auth(token));
    const actions = res.body.items.map((a) => `${a.action} ${a.entity}`);
    expect(actions).toEqual(expect.arrayContaining(["created subscription", "updated subscription", "paid subscription", "imported subscription"]));
    expect(res.body.items[0].user.name).toBe("Meera");
  });

  test("12-month forecast includes upcoming renewals", async () => {
    const s = (await api().get("/api/analytics/summary").set(auth(token))).body;
    expect(s.forecast).toHaveLength(12);
    expect(s.forecastTotal).toBeGreaterThan(0);
    expect(s.forecast[0].count).toBeGreaterThanOrEqual(1);
  });

  test("monthly report downloads as a PDF and can be emailed with an attachment", async () => {
    const month = new Date().toISOString().slice(0, 7);
    const pdf = await api()
      .get(`/api/reports/monthly?month=${month}`)
      .set(auth(token, wsId))
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/pdf/);
    expect(pdf.body.subarray(0, 4).toString()).toBe("%PDF");

    const before = outbox.length;
    await api().post("/api/reports/monthly/email").set(auth(token)).send({ month }).expect(200);
    const mail = outbox.slice(before).find((m) => m.to === "meera@test.com");
    expect(mail.attachments[0].filename).toBe(`subtrack-report-${month}.pdf`);
    expect((await api().get("/api/reports/monthly?month=2026-13").set(auth(token))).status).toBe(400);
  });
});

describe("Two-factor authentication", () => {
  let token, recoveryCodes, secret;

  beforeAll(async () => {
    ({ token } = await registerUser("Kiran", "kiran@test.com"));
  });

  test("setup returns a QR code; enabling needs a valid code and returns recovery codes", async () => {
    const setup = await api().post("/api/auth/2fa/setup").set(auth(token)).expect(200);
    expect(setup.body.qrCode).toMatch(/^data:image\/png;base64,/);
    secret = setup.body.secret;

    expect((await api().post("/api/auth/2fa/enable").set(auth(token)).send({ code: "000000" })).status).toBe(400);
    const { generate } = await import("otplib");
    const enabled = await api().post("/api/auth/2fa/enable").set(auth(token)).send({ code: await generate({ secret }) }).expect(200);
    expect(enabled.body.user.twoFactorEnabled).toBe(true);
    expect(enabled.body.user.twoFactorSecret).toBeUndefined();
    recoveryCodes = enabled.body.recoveryCodes;
    expect(recoveryCodes).toHaveLength(8);
  });

  test("login needs the second step, and the temporary token is not a login token", async () => {
    const step1 = await api().post("/api/auth/login").send({ email: "kiran@test.com", password: "secret123" }).expect(200);
    expect(step1.body.twoFactorRequired).toBe(true);
    expect(step1.body.accessToken).toBeUndefined();
    expect((await api().get("/api/auth/me").set(auth(step1.body.tempToken))).status).toBe(401);

    expect((await api().post("/api/auth/2fa/verify").send({ tempToken: step1.body.tempToken, code: "123456" })).status).toBe(401);
    const { generate } = await import("otplib");
    const ok = await api().post("/api/auth/2fa/verify").send({ tempToken: step1.body.tempToken, code: await generate({ secret }) });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
  });

  test("a recovery code works exactly once", async () => {
    const step1 = await api().post("/api/auth/login").send({ email: "kiran@test.com", password: "secret123" });
    const ok = await api().post("/api/auth/2fa/verify").send({ tempToken: step1.body.tempToken, code: recoveryCodes[0] }).expect(200);
    expect(ok.body.recoveryCodesLeft).toBe(7);
    const again = await api().post("/api/auth/2fa/verify").send({ tempToken: step1.body.tempToken, code: recoveryCodes[0] });
    expect(again.status).toBe(401);
  });

  test("disabling needs the password and a code", async () => {
    expect((await api().post("/api/auth/2fa/disable").set(auth(token)).send({ password: "wrong", code: recoveryCodes[1] })).status).toBe(400);
    const off = await api().post("/api/auth/2fa/disable").set(auth(token)).send({ password: "secret123", code: recoveryCodes[1] }).expect(200);
    expect(off.body.user.twoFactorEnabled).toBe(false);
    const login = await api().post("/api/auth/login").send({ email: "kiran@test.com", password: "secret123" });
    expect(login.body.accessToken).toBeTruthy();
  });
});

describe("Optional integrations report clearly when not configured", () => {
  let token;
  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    ({ token } = await registerUser("Config", "config@test.com"));
  });

  test("config endpoint says what is available", async () => {
    const res = await api().get("/api/auth/config").expect(200);
    expect(res.body).toEqual({ vapidPublicKey: null, aiEnabled: true, aiProvider: "basic" });
  });

  test("without any AI key the assistant still answers from the data (smart answers)", async () => {
    await api().post("/api/subscriptions").set(auth(token)).send({ name: "Notion", cost: 800, nextRenewal: "2027-01-05" }).expect(201);
    const ask = (content) =>
      api().post("/api/ai/chat").set(auth(token)).send({ messages: [{ role: "user", content }] }).buffer(true).parse((res, cb) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => cb(null, text));
      });
    const res = await ask("How much do I spend per month?");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/event-stream/);
    expect(res.body).toMatch(/"provider":"basic"/);
    expect(res.body).toMatch(/1 active subscription/);
    expect(res.body).toMatch(/event: done/);
    expect((await ask("hello")).body).toMatch(/basic mode/);
    expect((await api().post("/api/ai/chat").set(auth(token)).send({ messages: [] })).status).toBe(400);
  });

  test("the AI assistant races several Gemini models, uses the first to answer, and never hangs", async () => {
    const realFetch = global.fetch;
    const enc = new TextEncoder();
    let cancelled = 0;
    const stall = (opts) =>
      new Promise((_, reject) => opts.signal.addEventListener("abort", () => (cancelled++, reject(new DOMException("aborted", "AbortError")))));
    const answer = (text) => ({
      ok: true,
      body: new ReadableStream({
        start(c) {
          c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] })}
`));
          c.close();
        },
      }),
    });
    const ask = () =>
      api().post("/api/ai/chat").set(auth(token)).send({ messages: [{ role: "user", content: "How much do I spend per month?" }] }).buffer(true).parse((res, cb) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => cb(null, text));
      });
    Object.assign(process.env, { GEMINI_API_KEY: "test", AI_FIRST_TEXT_MS: "500" });
    try {
      // Two models stall, one answers -> its answer is used and the stalled requests are cancelled
      global.fetch = async (url, opts) => (String(url).includes("gemini-3.1-flash-lite:") ? answer("Hello from the fastest model") : stall(opts));
      let started = Date.now();
      let res = await ask();
      expect(res.body).toMatch(/Hello from the fastest model/);
      expect(res.body).toMatch(/"model":"gemini-3.1-flash-lite"/);
      expect(cancelled).toBe(2);
      expect(Date.now() - started).toBeLessThan(5000);

      // Every model stalls -> an instant answer from the built-in smart answers instead of waiting forever
      global.fetch = async (url, opts) => (String(url).includes("generativelanguage") ? stall(opts) : realFetch(url, opts));
      started = Date.now();
      res = await ask();
      expect(res.body).toMatch(/too busy/);
      expect(res.body).toMatch(/"provider":"basic"/);
      expect(res.body).toMatch(/event: done/);
      expect(Date.now() - started).toBeLessThan(5000);

      // The model is given precomputed totals instead of having to add them up
      let sentPrompt = "";
      global.fetch = async (url, opts) => ((sentPrompt = opts.body), answer("ok"));
      await ask();
      expect(JSON.parse(sentPrompt).systemInstruction.parts[1].text).toMatch(/"totals":\{"currency":"INR","activeSubscriptions":1,/);
    } finally {
      global.fetch = realFetch;
      for (const key of ["GEMINI_API_KEY", "AI_FIRST_TEXT_MS"]) delete process.env[key];
    }
  });

  test("emails go through Brevo's HTTP API when BREVO_API_KEY is set", async () => {
    const { sendEmail } = await import("../utils/email.js");
    const realFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ messageId: "abc" }) };
    };
    process.env.BREVO_API_KEY = "test-brevo-key";
    process.env.EMAIL_FROM = "SubTrack <alerts@example.com>";
    try {
      const result = await sendEmail({ to: "friend@test.com", subject: "Hello", text: "Line 1\nLine 2", attachments: [{ filename: "r.pdf", content: Buffer.from("PDF") }] });
      expect(result).toEqual({ delivered: true });
      expect(calls[0].url).toBe("https://api.brevo.com/v3/smtp/email");
      expect(calls[0].options.headers["api-key"]).toBe("test-brevo-key");
      const body = JSON.parse(calls[0].options.body);
      expect(body.sender).toEqual({ name: "SubTrack", email: "alerts@example.com" });
      expect(body.to).toEqual([{ email: "friend@test.com" }]);
      expect(body.textContent).toBe("Line 1\nLine 2");
      expect(body.htmlContent).toMatch(/Line 1<br>Line 2/);
      expect(body.attachment).toEqual([{ name: "r.pdf", content: Buffer.from("PDF").toString("base64") }]);
    } finally {
      global.fetch = realFetch;
      delete process.env.BREVO_API_KEY;
      delete process.env.EMAIL_FROM;
    }
  });

  test("push returns 503 with a helpful message; Google sign-in no longer exists", async () => {
    expect((await api().post("/api/auth/google").send({ credential: "x" })).status).toBe(404);
    expect((await api().post("/api/push/subscribe").set(auth(token)).send({ endpoint: "https://x", keys: { p256dh: "a", auth: "b" } })).status).toBe(503);
  });
});

describe("Phone numbers", () => {
  const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  let token;

  beforeAll(async () => {
    const res = await api().post("/api/auth/register").send({ name: "Nila", email: "nila@test.com", password: "secret123", phone: "98765 43210" });
    expect(res.status).toBe(201);
    expect(res.body.user.phone).toBe("+919876543210"); // 10-digit numbers default to India (+91)
    token = res.body.accessToken;
  });

  test("phone numbers are validated and can be changed or cleared in the profile", async () => {
    const bad = await api().post("/api/auth/register").send({ name: "X", email: "x-phone@test.com", password: "secret123", phone: "12" });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/valid phone number/);

    let res = await api().put("/api/auth/profile").set(auth(token)).send({ phone: "+44 7700 900123" }).expect(200);
    expect(res.body.user.phone).toBe("+447700900123");
    res = await api().put("/api/auth/profile").set(auth(token)).send({ phone: "" }).expect(200);
    expect(res.body.user.phone).toBe("");
  });

  test("split participants keep their phone number; messages go by email only", async () => {
    const before = outbox.length;
    const created = await api().post("/api/subscriptions").set(auth(token)).send({
      name: "Hotstar",
      cost: 900,
      billingCycle: "quarterly",
      nextRenewal: inDays(40),
      splitWith: [{ name: "Ilaya", email: "ilaya@test.com", phone: "9123456780", share: 50 }],
    });
    expect(created.status).toBe(201);
    expect(created.body.splitWith[0].phone).toBe("+919123456780");
    expect(created.body.splitEmailsSent).toBe(1);
    expect(created.body.splitWhatsAppsSent).toBeUndefined();
    expect(outbox.slice(before).some((m) => m.to === "ilaya@test.com" && /added you to the Hotstar cost split/.test(m.subject))).toBe(true);
  });

  test("WhatsApp has been removed", async () => {
    expect((await api().get("/api/auth/whatsapp").set(auth(token))).status).toBe(404);
    const config = await api().get("/api/auth/config").expect(200);
    expect(config.body).not.toHaveProperty("whatsappEnabled");
  });
});
