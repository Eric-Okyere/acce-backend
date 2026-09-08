"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const User_1 = require("../models/User");
const phone_1 = require("../lib/phone");
const password_1 = require("../lib/password");
const jwt_1 = require("../lib/jwt");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
exports.authRouter = (0, express_1.Router)();
exports.authRouter.post("/login", async (req, res) => {
    const phone = String(req.body?.phone ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!phone || !password)
        throw (0, errors_1.badRequest)("Enter your phone number and password.");
    const user = await User_1.User.findOne({ phone: (0, phone_1.normalizePhone)(phone) });
    if (!user || !user.is_active)
        throw (0, errors_1.badRequest)("No active account found with that phone number.");
    const ok = await (0, password_1.verifyPassword)(password, user.password_hash);
    if (!ok)
        throw (0, errors_1.badRequest)("Incorrect password.");
    const token = (0, jwt_1.signSessionToken)({ sub: String(user._id), role: user.role, name: user.name });
    await (0, audit_1.writeAudit)({ actorId: String(user._id), action: "LOGIN" });
    res.json({ token, user: user.toJSON() });
});
exports.authRouter.get("/me", auth_1.authenticate, async (req, res) => {
    const user = await User_1.User.findById(req.session.sub);
    if (!user) {
        res.status(404).json({ error: "Account not found." });
        return;
    }
    res.json(user.toJSON());
});
exports.authRouter.post("/change-password", auth_1.authenticate, async (req, res) => {
    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");
    const confirmPassword = String(req.body?.confirmPassword ?? "");
    if (newPassword.length < 8)
        throw (0, errors_1.badRequest)("New password must be at least 8 characters.");
    if (newPassword !== confirmPassword)
        throw (0, errors_1.badRequest)("New passwords don't match.");
    const user = await User_1.User.findById(req.session.sub);
    if (!user)
        throw (0, errors_1.badRequest)("Account not found.");
    const ok = await (0, password_1.verifyPassword)(currentPassword, user.password_hash);
    if (!ok)
        throw (0, errors_1.badRequest)("Current password is incorrect.");
    user.password_hash = await (0, password_1.hashPassword)(newPassword);
    user.must_reset_password = false;
    user.updated_at = new Date();
    await user.save();
    await (0, audit_1.writeAudit)({ actorId: String(user._id), action: "CHANGE_PASSWORD" });
    res.json({ success: true });
});
