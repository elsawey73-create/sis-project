// خطأ بنرميه من أي مكان، والـ error handler في server.js بيحوّله لرد JSON
class HttpError extends Error {
  constructor(status, code, details) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
module.exports = { HttpError };
