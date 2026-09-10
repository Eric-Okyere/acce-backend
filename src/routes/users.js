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
    // Course reps attend lectures in their own program just like students do
    // (see attendance.js — check-in is open to STUDENT and COURSE_REP), and
    // check-in requires the person's own index number to already be on file
    // to verify against. So unlike a student's (optional) index number, a
    // course rep's is required at registration time.
    if (role === "COURSE_REP" && !indexNumber) {
        throw (0, errors_1.badRequest)("An index number is required for course reps — they also check in to lectures and need attendance taken, same as any student.");
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
// Admin resets any admin-created user's password (teacher / course rep / student).
// Passwords are stored as bcrypt hashes only — there's no way to look the
// original temp password back up, so this is the retrieval mechanism: it
// always ISSUES A NEW ONE rather than revealing an old one. Returned once in
// the response body, same as at registration time. Also flips
// must_reset_password back on, since the admin (not the user) just chose it.
exports.usersRouter.patch("/:id/reset-password", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const user = await User_1.User.findById(req.params.id);
    if (!user)
        throw (0, errors_1.notFound)("User");
    const tempPassword = (0, password_1.generateTempPassword)();
    user.password_hash = await (0, password_1.hashPassword)(tempPassword);
    user.must_reset_password = true;
    user.updated_at = new Date();
    await user.save();
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: "RESET_USER_PASSWORD",
        targetType: "user",
        targetId: String(user._id),
    });
    res.json({ user: user.toJSON(), tempPassword });
});
// Backfills or corrects a user's index number — mainly for course reps that
// existed before index numbers were required for that role (see the check in
// POST "/" above), so admin can bring an already-registered course rep up to
// the point where they can check in to lectures without re-creating their
// account. Works for any role; harmless for teachers/admins even though they
// never check in.
exports.usersRouter.patch("/:id/index-number", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const indexNumber = String(req.body?.indexNumber ?? "").trim();
    if (!indexNumber)
        throw (0, errors_1.badRequest)("Enter an index number.");
    const user = await User_1.User.findById(req.params.id);
    if (!user)
        throw (0, errors_1.notFound)("User");
    const clash = await User_1.User.findOne({ index_number: indexNumber, _id: { $ne: user._id } });
    if (clash)
        throw (0, errors_1.badRequest)("That index number is already in use by someone else.", "INDEX_NUMBER_TAKEN");
    user.index_number = indexNumber;
    user.updated_at = new Date();
    await user.save();
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: "SET_INDEX_NUMBER",
        targetType: "user",
        targetId: String(user._id),
        metadata: { indexNumber },
    });
    res.json({ user: user.toJSON() });
});
