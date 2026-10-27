// Phone numbers are stored in the international E.164 format (e.g. +919876543210).
// A plain 10-digit number is treated as Indian (+91) unless DEFAULT_COUNTRY_CODE says otherwise.
const E164 = /^\+[1-9]\d{7,14}$/;

export const normalizePhone = (input) => {
  if (input === undefined || input === null) return input;
  let digits = String(input).trim().replace(/[\s\-().]/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("+")) return digits;
  const country = String(process.env.DEFAULT_COUNTRY_CODE || "91").replace(/\D/g, "");
  if (digits.length === 10) return `+${country}${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+${country}${digits.slice(1)}`;
  return `+${digits}`;
};

export const isValidPhone = (phone) => E164.test(phone);
