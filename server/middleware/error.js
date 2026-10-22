export const notFound = (req, res) => {
  res.status(404).json({ message: `Not found - ${req.originalUrl}` });
};

// Express 5 forwards errors thrown in async handlers here automatically.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  let status = err.statusCode || err.status || 500;
  let message = err.message || "Server error";

  if (err.name === "ValidationError") {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(", ");
  } else if (err.name === "CastError") {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    message = `${Object.keys(err.keyValue).join(", ")} already exists`;
  } else if (err.name === "MulterError") {
    status = 400;
    message = err.code === "LIMIT_FILE_SIZE" ? "File is too large" : err.message;
  } else if (err.type === "entity.parse.failed") {
    status = 400;
    message = "Invalid JSON body";
  }

  if (status >= 500) console.error(err);
  res.status(status).json({ message: status >= 500 && process.env.NODE_ENV === "production" ? "Server error" : message });
};
