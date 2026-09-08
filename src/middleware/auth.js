"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireRole = requireRole;
const jwt_1 = require("../lib/jwt");
/** Reads `Authorization: Bearer <token>`, verifies it, and attaches req.session. */
function authenticate(req, res, next) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        res.status(401).json({ error: "Not signed in." });
        return;
    }
    const session = (0, jwt_1.verifySessionToken)(token);
    if (!session) {
        res.status(401).json({ error: "Your session has expired — please sign in again." });
        return;
    }
    req.session = session;
    next();
}
/** Use after `authenticate`. Rejects with 403 if the caller's role isn't in the allow-list. */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.session || !roles.includes(req.session.role)) {
            res.status(403).json({ error: "You don't have permission to do that." });
            return;
        }
        next();
    };
}
