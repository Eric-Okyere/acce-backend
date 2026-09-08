"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
function required(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`);
    }
    return value;
}
exports.env = {
    PORT: Number(process.env.PORT ?? 4000),
    MONGODB_URI: required("MONGODB_URI"),
    JWT_SECRET: required("JWT_SECRET"),
    QR_SIGNING_SECRET: required("QR_SIGNING_SECRET"),
    FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
    NODE_ENV: process.env.NODE_ENV ?? "development",
};
