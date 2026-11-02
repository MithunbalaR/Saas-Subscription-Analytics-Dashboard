import { body, param, query } from "express-validator";
import { BILLING_CYCLES, CATEGORIES, STATUSES } from "../utils/billing.js";
import { CURRENCIES } from "../utils/currency.js";
import { isValidPhone, normalizePhone } from "../utils/phone.js";

// ---------- shared ----------
export const idParam = (name = "id") => param(name).isMongoId().withMessage(`Invalid ${name}`);

const email = () => body("email").trim().toLowerCase().isEmail().withMessage("Enter a valid email address");
const newPassword = (field = "password") =>
  body(field).isLength({ min: 6, max: 128 }).withMessage("Password must be 6-128 characters");

export const paging = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive number"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be between 1 and 100"),
  query("order").optional().isIn(["asc", "desc"]).withMessage("order must be asc or desc"),
];

// Optional WhatsApp number: normalised to E.164 ("98765 43210" -> "+919876543210"), empty clears it.
const phone = (field = "phone") =>
  body(field)
    .optional({ values: "null" })
    .customSanitizer(normalizePhone)
    .custom((value) => value === "" || isValidPhone(value))
    .withMessage("Enter a valid phone number with country code, e.g. +91 98765 43210");

// ---------- auth ----------
export const registerRules = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 60 }).withMessage("Name is too long"),
  email(),
  newPassword(),
  phone(),
];

export const loginRules = [email(), body("password").notEmpty().withMessage("Password is required")];

export const forgotRules = [email()];

export const resetRules = [
  email(),
  body("otp").trim().matches(/^\d{6}$/).withMessage("Enter the 6-digit code"),
  newPassword(),
];

export const changePasswordRules = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  newPassword("newPassword"),
];

export const profileRules = [
  body("name").optional().trim().notEmpty().withMessage("Name cannot be empty").isLength({ max: 60 }),
  body("emailReminders").optional().isBoolean().withMessage("emailReminders must be true or false").toBoolean(),
  body("whatsappNotifications").optional().isBoolean().withMessage("whatsappNotifications must be true or false").toBoolean(),
  phone(),
  body("reminderDays").optional().isInt({ min: 1, max: 30 }).withMessage("Reminder days must be 1-30").toInt(),
  body("language").optional().isIn(["en", "hi", "ta"]).withMessage("Unsupported language"),
];

// ---------- subscriptions ----------
export const subscriptionRules = (isUpdate = false) => {
  const required = (chain) => (isUpdate ? chain.optional() : chain);
  return [
    required(body("name")).trim().notEmpty().withMessage("Name is required").isLength({ max: 80 }),
    required(body("cost")).isFloat({ min: 0 }).withMessage("Cost must be a positive number").toFloat(),
    required(body("nextRenewal")).isISO8601().withMessage("Next renewal must be a valid date"),
    body("currency").optional().isIn(CURRENCIES).withMessage("Unsupported currency"),
    body("billingCycle").optional().isIn(BILLING_CYCLES).withMessage("Invalid billing cycle"),
    body("category").optional().isIn(CATEGORIES).withMessage("Invalid category"),
    body("status").optional().isIn(STATUSES).withMessage("Invalid status"),
    body("startDate").optional({ values: "falsy" }).isISO8601().withMessage("Start date must be a valid date"),
    body("website").optional({ values: "falsy" }).trim().isURL().withMessage("Website must be a valid URL"),
    body("paymentMethod").optional().trim().isLength({ max: 40 }),
    body("notes").optional().trim().isLength({ max: 500 }).withMessage("Notes are too long"),
    body("isTrial").optional().isBoolean().withMessage("isTrial must be true or false").toBoolean(),
    body("splitWith").optional().isArray({ max: 10 }).withMessage("You can split with up to 10 people"),
    body("splitWith.*.name").trim().notEmpty().withMessage("Each person in the split needs a name").isLength({ max: 60 }),
    body("splitWith.*.email").optional({ values: "falsy" }).trim().isEmail().withMessage("Enter a valid email for each person").toLowerCase(),
    phone("splitWith.*.phone"),
    body("splitWith.*.share").isFloat({ min: 1, max: 99 }).withMessage("Each share must be between 1% and 99%").toFloat(),
  ];
};

export const importRules = [
  body("items").isArray({ min: 1, max: 500 }).withMessage("Send between 1 and 500 rows"),
];

export const subscriptionListRules = [
  query("status").optional().isIn(STATUSES),
  query("category").optional().isIn(CATEGORIES),
  query("sort").optional().isIn(["name", "cost", "nextRenewal", "category", "status", "createdAt"]),
  query("order").optional().isIn(["asc", "desc"]),
];

// ---------- expenses ----------
export const expenseRules = (isUpdate = false) => {
  const required = (chain) => (isUpdate ? chain.optional() : chain);
  return [
    required(body("title")).trim().notEmpty().withMessage("Title is required").isLength({ max: 100 }),
    required(body("amount")).isFloat({ min: 0 }).withMessage("Amount must be a positive number").toFloat(),
    required(body("date")).isISO8601().withMessage("Date must be a valid date"),
    body("currency").optional().isIn(CURRENCIES).withMessage("Unsupported currency"),
    body("category").optional().isIn(CATEGORIES).withMessage("Invalid category"),
    body("subscription").optional({ values: "falsy" }).isMongoId().withMessage("Invalid linked subscription"),
    body("notes").optional().trim().isLength({ max: 500 }).withMessage("Notes are too long"),
  ];
};

export const expenseListRules = [
  ...paging,
  query("category").optional().isIn(CATEGORIES),
  query("from").optional().isISO8601().withMessage("from must be a date"),
  query("to").optional().isISO8601().withMessage("to must be a date"),
  query("sort").optional().isIn(["date", "amount", "title", "category"]),
];

// ---------- workspaces ----------
export const workspaceCreateRules = [
  body("name").trim().notEmpty().withMessage("Workspace name is required").isLength({ max: 60 }),
  body("currency").optional().isIn(CURRENCIES).withMessage("Unsupported currency"),
];

export const workspaceUpdateRules = [
  idParam(),
  body("name").optional().trim().notEmpty().withMessage("Workspace name is required").isLength({ max: 60 }),
  body("currency").optional().isIn(CURRENCIES).withMessage("Unsupported currency"),
  body("monthlyBudget").optional().isFloat({ min: 0 }).withMessage("Budget must be 0 or more").toFloat(),
  body("categoryBudgets")
    .optional()
    .isObject()
    .withMessage("categoryBudgets must be an object")
    .custom((value) =>
      Object.entries(value).every(([k, v]) => CATEGORIES.includes(k) && Number.isFinite(Number(v)) && Number(v) >= 0)
    )
    .withMessage("Category budgets must use valid categories and amounts of 0 or more"),
];

export const memberRules = [idParam(), email()];

// ---------- admin ----------
export const adminUserUpdateRules = [idParam(), body("role").isIn(["user", "admin"]).withMessage("Role must be user or admin")];
