"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.forbidden = exports.badRequest = exports.notFound = exports.AppError = void 0;
/** A business-rule error with an HTTP status and a machine-readable code (mirrored to the frontend). */
class AppError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.name = "AppError";
        this.status = status;
        this.code = code;
    }
}
exports.AppError = AppError;
const notFound = (what) => new AppError(404, "NOT_FOUND", `${what} not found.`);
exports.notFound = notFound;
const badRequest = (message, code = "BAD_REQUEST") => new AppError(400, code, message);
exports.badRequest = badRequest;
const forbidden = (message, code = "FORBIDDEN") => new AppError(403, code, message);
exports.forbidden = forbidden;
