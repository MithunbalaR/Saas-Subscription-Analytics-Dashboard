export const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// Copy only whitelisted fields from the request body (prevents overwriting `workspace`, `_id`, ...).
export const pick = (body, fields) =>
  Object.fromEntries(fields.filter((f) => body?.[f] !== undefined).map((f) => [f, body[f]]));

export const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Read ?page=&limit= with sensible bounds.
export const getPaging = (query, defaultLimit = 10) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

// Read ?sort=&order= against a whitelist of sortable fields.
export const getSort = (query, allowed, fallback) => {
  const field = allowed.includes(query.sort) ? query.sort : fallback;
  return { [field]: query.order === "desc" ? -1 : 1, _id: 1 };
};
