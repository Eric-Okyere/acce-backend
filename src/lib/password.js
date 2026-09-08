"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.generateTempPassword = generateTempPassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const SALT_ROUNDS = 10;
async function hashPassword(plain) {
    return bcryptjs_1.default.hash(plain, SALT_ROUNDS);
}
async function verifyPassword(plain, hash) {
    return bcryptjs_1.default.compare(plain, hash);
}
/** Generates a random, easy-to-read temporary password for newly registered users. */
function generateTempPassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars (0/O, 1/I)
    let out = "";
    const bytes = node_crypto_1.default.randomBytes(8);
    for (let i = 0; i < 8; i++)
        out += alphabet[bytes[i] % alphabet.length];
    return out;
}
