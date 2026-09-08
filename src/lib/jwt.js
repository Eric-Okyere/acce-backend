"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signSessionToken = signSessionToken;
exports.verifySessionToken = verifySessionToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../env");
const SESSION_DAYS = 7;
function signSessionToken(payload) {
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
}
function verifySessionToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
        if (!decoded.sub || !decoded.role)
            return null;
        return { sub: String(decoded.sub), role: decoded.role, name: decoded.name ?? "" };
    }
    catch {
        return null;
    }
}
