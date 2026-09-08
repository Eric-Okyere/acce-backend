"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhone = normalizePhone;
/** Normalizes Ghanaian numbers loosely so "024..." and "+233 24..." resolve to the same user. */
function normalizePhone(raw) {
    const digits = raw.replace(/[^\d+]/g, "");
    if (digits.startsWith("+233"))
        return "0" + digits.slice(4);
    if (digits.startsWith("233"))
        return "0" + digits.slice(3);
    return digits;
}
