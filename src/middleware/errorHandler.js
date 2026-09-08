"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const errors_1 = require("../lib/errors");
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function errorHandler(err, _req, res, _next) {
    if (err instanceof errors_1.AppError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
    }
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
        // MongoDB duplicate-key error
        res.status(409).json({ error: "That value is already in use.", code: "DUPLICATE" });
        return;
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server.", code: "INTERNAL" });
}
