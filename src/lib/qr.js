"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signHallToken = signHallToken;
exports.verifyHallToken = verifyHallToken;
exports.hallQrDataUrl = hallQrDataUrl;
// Signed QR tokens for lecture halls — see the frontend README for the full
// rationale. The signing secret (QR_SIGNING_SECRET) lives only here, on the
// backend, which is exactly why this check has to happen server-side: the
// frontend can display the resulting QR image, but it can never generate or
// validate one itself.
const node_crypto_1 = __importDefault(require("node:crypto"));
const qrcode_1 = __importDefault(require("qrcode"));
const env_1 = require("../env");
function base64url(input) {
    return Buffer.from(input).toString("base64url");
}
function signHallToken(hallId, lat, lng) {
    const payload = { hallId, lat, lng, v: 1 };
    const payloadB64 = base64url(JSON.stringify(payload));
    const sig = node_crypto_1.default.createHmac("sha256", env_1.env.QR_SIGNING_SECRET).update(payloadB64).digest();
    return `${payloadB64}.${base64url(sig)}`;
}
function verifyHallToken(token) {
    const parts = token.split(".");
    if (parts.length !== 2)
        return null;
    const [payloadB64, sigB64] = parts;
    const expectedSig = node_crypto_1.default.createHmac("sha256", env_1.env.QR_SIGNING_SECRET).update(payloadB64).digest();
    let providedSig;
    try {
        providedSig = Buffer.from(sigB64, "base64url");
    }
    catch {
        return null;
    }
    if (providedSig.length !== expectedSig.length)
        return null;
    if (!node_crypto_1.default.timingSafeEqual(providedSig, expectedSig))
        return null;
    try {
        const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
        if (typeof payload.hallId !== "string" || typeof payload.lat !== "number" || typeof payload.lng !== "number") {
            return null;
        }
        return payload;
    }
    catch {
        return null;
    }
}
// The printed/displayed QR encodes a LINK into the check-in page (/scan?token=…)
// rather than the raw signed token text. A raw token isn't a URL, so a
// person's default camera app (not this app's own in-page scanner) can only
// ever offer to "copy" it — it has nothing to open. Wrapping it in a link
// means any camera app (or just tapping the code) opens the browser straight
// to the check-in form. The token itself, and how it's verified
// (verifyHallToken above), are completely unchanged — only what gets drawn
// into the QR image changes. See routes/halls.js's GET "/:id/qr" for the only
// caller, and frontend app/scan/page.tsx for what reads the `token` param.
function hallScanUrl(token) {
    return `${env_1.env.FRONTEND_ORIGIN}/scan?token=${encodeURIComponent(token)}`;
}
async function hallQrDataUrl(token) {
    return qrcode_1.default.toDataURL(hallScanUrl(token), { errorCorrectionLevel: "M", margin: 2, width: 480 });
}
