// Thrown from route code. The error handler in server.js turns it into JSON.
class HttpError extends Error {
  constructor(status, code, details) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
module.exports = { HttpError };
