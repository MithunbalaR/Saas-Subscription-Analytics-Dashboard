import Expense from "../models/Expense.js";
import Subscription from "../models/Subscription.js";
import { deleteStoredFile, saveUpload, sendStoredFile } from "../utils/files.js";
import { round2 } from "../utils/billing.js";
import { convert, formatMoney, getRates } from "../utils/currency.js";
import { checkBudgetAlerts } from "../utils/spend.js";
import { logActivity } from "../utils/activity.js";
import { httpError, pick, escapeRegex, getPaging, getSort } from "../utils/helpers.js";

const FIELDS = ["title", "amount", "currency", "category", "date", "subscription", "notes"];
const SORTABLE = ["date", "amount", "title", "category"];

const findOwned = async (id, workspaceId) => {
  const expense = await Expense.findOne({ _id: id, workspace: workspaceId });
  if (!expense) throw httpError(404, "Expense not found");
  return expense;
};

// receipt.filename holds the id of the StoredFile document with the file's contents.
const removeReceiptFile = (expense) => deleteStoredFile(expense.receipt?.filename);

// Normalise the optional subscription link and make sure it belongs to this workspace.
const cleanBody = async (body, workspaceId) => {
  const data = pick(body, FIELDS);
  if (data.subscription === "") data.subscription = null;
  if (data.subscription) {
    const owned = await Subscription.exists({ _id: data.subscription, workspace: workspaceId });
    if (!owned) throw httpError(400, "Linked subscription not found");
  }
  return data;
};

const buildFilter = (query, workspaceId) => {
  const { category, q, from, to } = query;
  const filter = { workspace: workspaceId };
  if (category) filter.category = category;
  if (q) filter.title = { $regex: escapeRegex(q), $options: "i" };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  return filter;
};

// Sum of the filtered expenses in the workspace currency.
const totalInBase = async (filter, base) => {
  const [rows, { rates }] = await Promise.all([
    Expense.aggregate([{ $match: filter }, { $group: { _id: "$currency", total: { $sum: "$amount" } } }]),
    getRates(),
  ]);
  return round2(rows.reduce((sum, r) => sum + convert(r.total, r._id, base, rates), 0));
};

// GET /api/expenses?category=&q=&from=&to=&page=&limit=&sort=&order=
export const getExpenses = async (req, res) => {
  const filter = buildFilter(req.query, req.workspace._id);
  const { page, limit, skip } = getPaging(req.query);
  const sort = getSort({ order: "desc", ...req.query }, SORTABLE, "date");

  const [items, total, totalAmount] = await Promise.all([
    Expense.find(filter).sort(sort).skip(skip).limit(limit).populate("subscription", "name"),
    Expense.countDocuments(filter),
    totalInBase(filter, req.workspace.currency),
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit, totalAmount });
};

// GET /api/expenses/export - every matching expense (no paging) for CSV/PDF export
export const exportExpenses = async (req, res) => {
  const filter = buildFilter(req.query, req.workspace._id);
  const sort = getSort({ order: "desc", ...req.query }, SORTABLE, "date");
  const [items, totalAmount] = await Promise.all([
    Expense.find(filter).sort(sort).limit(5000).populate("subscription", "name"),
    totalInBase(filter, req.workspace.currency),
  ]);
  res.json({ items, totalAmount, currency: req.workspace.currency });
};

// POST /api/expenses
export const createExpense = async (req, res) => {
  const data = await cleanBody(req.body, req.workspace._id);
  const expense = await Expense.create({
    currency: req.workspace.currency,
    ...data,
    workspace: req.workspace._id,
    createdBy: req.user._id,
  });
  await logActivity(req.workspace, req.user, { action: "added", entity: "expense", entityName: expense.title, details: formatMoney(expense.amount, expense.currency) });
  await checkBudgetAlerts(req.workspace._id);
  res.status(201).json(await expense.populate("subscription", "name"));
};

// PUT /api/expenses/:id
export const updateExpense = async (req, res) => {
  const expense = await findOwned(req.params.id, req.workspace._id);
  expense.set(await cleanBody(req.body, req.workspace._id));
  await expense.save();
  await logActivity(req.workspace, req.user, { action: "updated", entity: "expense", entityName: expense.title, details: formatMoney(expense.amount, expense.currency) });
  await checkBudgetAlerts(req.workspace._id);
  res.json(await expense.populate("subscription", "name"));
};

// DELETE /api/expenses/:id
export const deleteExpense = async (req, res) => {
  const expense = await findOwned(req.params.id, req.workspace._id);
  await logActivity(req.workspace, req.user, { action: "deleted", entity: "expense", entityName: expense.title });
  await removeReceiptFile(expense);
  await expense.deleteOne();
  res.json({ message: "Expense deleted" });
};

// POST /api/expenses/:id/receipt  (multipart/form-data, field "receipt")
export const uploadReceipt = async (req, res) => {
  if (!req.file) throw httpError(400, "Please choose a file to upload");
  const expense = await findOwned(req.params.id, req.workspace._id);
  await removeReceiptFile(expense);
  expense.receipt = {
    filename: await saveUpload(req.file, { kind: "receipt", owner: req.user._id, workspace: req.workspace._id }),
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  };
  await expense.save();
  await logActivity(req.workspace, req.user, { action: "attached a receipt to", entity: "expense", entityName: expense.title });
  res.json(await expense.populate("subscription", "name"));
};

// GET /api/expenses/:id/receipt - only members of the workspace can download it
export const downloadReceipt = async (req, res) => {
  const expense = await findOwned(req.params.id, req.workspace._id);
  if (!expense.receipt?.filename) throw httpError(404, "No receipt attached");
  await sendStoredFile(res, expense.receipt.filename, {
    kind: "receipt",
    disposition: `inline; filename*=UTF-8''${encodeURIComponent(expense.receipt.originalName)}`,
  });
};

// DELETE /api/expenses/:id/receipt
export const deleteReceipt = async (req, res) => {
  const expense = await findOwned(req.params.id, req.workspace._id);
  await removeReceiptFile(expense);
  await logActivity(req.workspace, req.user, { action: "removed receipt from", entity: "expense", entityName: expense.title });
  expense.receipt = undefined;
  await expense.save();
  res.json(await expense.populate("subscription", "name"));
};
