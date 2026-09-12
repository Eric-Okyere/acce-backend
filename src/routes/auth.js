"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const User_1 = require("../models/User");
const Program_1 = require("../models/Program");
const Subject_1 = require("../models/Subject");
const phone_1 = require("../lib/phone");
const password_1 = require("../lib/password");
const jwt_1 = require("../lib/jwt");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
exports.authRouter = (0, express_1.Router)();
const VALID_LEVELS = [100, 200, 300, 400];
// Public self-registration for STUDENTS ONLY — teachers, course reps, and
// admins are still exclusively created by an admin (see routes/users.js).
// Eric explicitly asked for students to be able to sign themselves up rather
// than waiting on an admin to register them one by one. Trade-off worth
// knowing: unlike admin-created accounts, nothing here verifies that the
// index number a student types in actually belongs to them — the schema's
// unique index just stops the SAME number being claimed twice. An admin can
// still deactivate or fix any bogus self-registered account from the Students
// page if that ever becomes a problem.
exports.authRouter.post("/register-student", async (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();
    const password = String(req.body?.password ?? "");
    const confirmPassword = String(req.body?.confirmPassword ?? "");
    const programId = String(req.body?.programId ?? "").trim();
    const indexNumber = String(req.body?.indexNumber ?? "").trim();
    const level = Number(req.body?.level);
    const rawSubjectIds = Array.isArray(req.body?.subjectIds) ? req.body.subjectIds : [];
    const subjectIds = [...new Set(rawSubjectIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
    if (!name || !phone || !password || !programId || !indexNumber) {
        throw (0, errors_1.badRequest)("Fill in your name, phone number, password, program, and index number.");
    }
    if (!VALID_LEVELS.includes(level)) {
        throw (0, errors_1.badRequest)("Choose your level — 100, 200, 300 or 400.");
    }
    if (password.length < 8) {
        throw (0, errors_1.badRequest)("Password must be at least 8 characters.");
    }
    if (password !== confirmPassword) {
        throw (0, errors_1.badRequest)("Passwords don't match.");
    }
    if (subjectIds.length === 0) {
        throw (0, errors_1.badRequest)("Choose at least one course you're offering — this is what shows your name to the teacher for that course.");
    }
    const program = await Program_1.Program.findById(programId).catch(() => null);
    if (!program) {
        throw (0, errors_1.badRequest)("Choose a valid program.");
    }
    const subjects = await Subject_1.Subject.find({ _id: { $in: subjectIds } });
    if (subjects.length !== subjectIds.length) {
        throw (0, errors_1.badRequest)("One of the selected courses could not be found — refresh the page and try again.");
    }
    const wrongProgramSubject = subjects.find((s) => String(s.program_id) !== String(program._id));
    if (wrongProgramSubject) {
        throw (0, errors_1.badRequest)(`"${wrongProgramSubject.name}" isn't a course in the program you selected.`);
    }
    const normalizedPhone = (0, phone_1.normalizePhone)(phone);
    const existingPhone = await User_1.User.findOne({ phone: normalizedPhone });
    if (existingPhone) {
        throw (0, errors_1.badRequest)("An account with this phone number already exists — try signing in instead.");
    }
    const existingIndex = await User_1.User.findOne({ index_number: indexNumber });
    if (existingIndex) {
        throw (0, errors_1.badRequest)("An account with this index number already exists — try signing in instead.");
    }
    const user = await User_1.User.create({
        role: "STUDENT",
        name,
        phone: normalizedPhone,
        password_hash: await (0, password_1.hashPassword)(password),
        program_id: program._id,
        index_number: indexNumber,
        level,
        enrolled_subject_ids: subjects.map((s) => s._id),
        must_reset_password: false, // they chose this password themselves — nothing to reset
    });
    await (0, audit_1.writeAudit)({
        actorId: String(user._id),
        action: "SELF_REGISTER_STUDENT",
        targetType: "user",
        targetId: String(user._id),
        ipAddress: req.ip ?? null,
    });
    const token = (0, jwt_1.signSessionToken)({ sub: String(user._id), role: user.role, name: user.name });
    res.status(201).json({ token, user: user.toJSON() });
});
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
