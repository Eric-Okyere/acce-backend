"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = void 0;
const express_1 = require("express");
const User_1 = require("../models/User");
const phone_1 = require("../lib/phone");
const password_1 = require("../lib/password");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
exports.usersRouter = (0, express_1.Router)();
const VALID_ROLES = ["ADMIN", "TEACHER", "COURSE_REP", "STUDENT"];
exports.usersRouter.get("/me", auth_1.authenticate, async (req, res) => {
    const user = await User_1.User.findById(req.session.sub);
    if (!user) {
        res.status(404).json({ error: "Account not found." });
        return;
    }
    res.json(user.toJSON());
});
// Admin-only listing, e.g. GET /api/users?role=TEACHER or ?role=STUDENT&programId=...
exports.usersRouter.get("/", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const role = String(req.query.role ?? "");
    if (!VALID_ROLES.includes(role))
        throw (0, errors_1.badRequest)("Query param `role` must be one of " + VALID_ROLES.join(", "));
    const filter = { role };
    if (req.query.programId)
        filter.program_id = req.query.programId;
    const users = await User_1.User.find(filter).sort({ name: 1 });
    res.json(users.map((u) => u.toJSON()));
});
// Admin registers a teacher / course rep / student. Returns a generated temp password ONCE.
exports.usersRouter.post("/", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const role = String(req.body?.role ?? "");
    const name = String(req.body?.name ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();
    const programId = String(req.body?.programId ?? "").trim();
    const indexNumber = String(req.body?.indexNumber ?? "").trim();
    if (!VALID_ROLES.includes(role) || role === "ADMIN")
        throw (0, errors_1.badRequest)("Invalid role.");
    if (!name || !phone)
        throw (0, errors_1.badRequest)("Name and phone number are required.");
    if ((role === "COURSE_REP" || role === "STUDENT") && !programId) {
        throw (0, errors_1.badRequest)("A program is required for this role.");
    }
    const normalizedPhone = (0, phone_1.normalizePhone)(phone);
    const existing = await User_1.User.findOne({ phone: normalizedPhone });
    if (existing)
        throw (0, errors_1.badRequest)("A user with this phone number already exists.");
    const tempPassword = (0, password_1.generateTempPassword)();
    const user = await User_1.User.create({
        role,
        name,
        phone: normalizedPhone,
        password_hash: await (0, password_1.hashPassword)(tempPassword),
        program_id: programId || null,
        // `undefined` (not `null`) when absent — see the comment on the schema
        // field in models/User.js for why this matters for the sparse index.
        index_number: indexNumber || undefined,
    });
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: `CREATE_${role}`,
        targetType: "user",
        targetId: String(user._id),
    });
    res.status(201).json({ user: user.toJSON(), tempPassword });
});
exports.usersRouter.patch("/:id/active", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const isActive = Boolean(req.body?.isActive);
    const user = await User_1.User.findByIdAndUpdate(req.params.id, { is_active: isActive, updated_at: new Date() }, { new: true });
    if (!user) {
        res.status(404).json({ error: "User not found." });
        return;
    }
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: isActive ? "ACTIVATE_USER" : "DEACTIVATE_USER",
        targetType: "user",
        targetId: String(req.params.id),
    });
    res.json(user.toJSON());
});
