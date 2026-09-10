"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = void 0;
const express_1 = require("express");
const User_1 = require("../models/User");
const Subject_1 = require("../models/Subject");
const phone_1 = require("../lib/phone");
const password_1 = require("../lib/password");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
exports.usersRouter = (0, express_1.Router)();
const VALID_ROLES = ["ADMIN", "TEACHER", "COURSE_REP", "STUDENT"];
// Roles an admin can create directly through POST "/" below. COURSE_REP is
// deliberately excluded — per Eric's direction, a course rep is no longer
// registered directly. Instead: the person registers (or is registered) as a
// STUDENT first, then an admin promotes that student to COURSE_REP via
// PATCH "/:id/promote-course-rep", which also assigns the one or more
// subjects they're responsible for. This means a course rep always already
// has their own chosen (or admin-issued) password and index number before
// they become a course rep — no separate credential-issuing step for that
// role anymore.
const DIRECTLY_CREATABLE_ROLES = ["TEACHER", "STUDENT"];
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
    if (!DIRECTLY_CREATABLE_ROLES.includes(role)) {
        throw (0, errors_1.badRequest)("Course reps aren't registered directly — register this person as a student first, then promote them to course rep from the Course reps page.", "USE_PROMOTION_FLOW");
    }
    if (!name || !phone)
        throw (0, errors_1.badRequest)("Name and phone number are required.");
    if (role === "STUDENT" && !programId) {
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
// Promotes an existing student to course rep, assigning them one or more
// subjects they're responsible for scheduling lectures in (see
// routes/lectures.js's POST "/" handler, which only allows a rep to schedule
// for a subject in this list). Also doubles as "change which subjects a
// course rep is responsible for" — calling this again on an existing course
// rep just replaces the whole responsible_subject_ids list with the one sent.
exports.usersRouter.patch("/:id/promote-course-rep", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const rawSubjectIds = Array.isArray(req.body?.subjectIds) ? req.body.subjectIds : [];
    const subjectIds = [...new Set(rawSubjectIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
    if (subjectIds.length === 0)
        throw (0, errors_1.badRequest)("Pick at least one subject this course rep will be responsible for.");
    const user = await User_1.User.findById(req.params.id);
    if (!user)
        throw (0, errors_1.notFound)("User");
    if (user.role !== "STUDENT" && user.role !== "COURSE_REP") {
        throw (0, errors_1.badRequest)("Only a student can be promoted to course rep.");
    }
    // Course reps check in to lectures the same way a student does (see
    // routes/attendance.js), which requires their own index number to verify
    // against — so promotion is blocked until one is on file, same
    // requirement as v3.10's now-removed direct-creation path.
    if (!user.index_number) {
        throw (0, errors_1.badRequest)(`${user.name} has no index number on file yet — add one (see the Students page) before promoting them to course rep.`, "INDEX_NUMBER_REQUIRED");
    }
    const subjects = await Subject_1.Subject.find({ _id: { $in: subjectIds } });
    if (subjects.length !== subjectIds.length) {
        throw (0, errors_1.notFound)("Subject");
    }
    const wrongProgramSubject = subjects.find((s) => String(s.program_id) !== String(user.program_id));
    if (wrongProgramSubject) {
        throw (0, errors_1.badRequest)(`${user.name} is registered under a different program than "${wrongProgramSubject.name}" — pick subjects from their own program.`, "PROGRAM_MISMATCH");
    }
    const wasStudent = user.role === "STUDENT";
    user.role = "COURSE_REP";
    user.responsible_subject_ids = subjects.map((s) => s._id);
    user.updated_at = new Date();
    await user.save();
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: wasStudent ? "PROMOTE_TO_COURSE_REP" : "REASSIGN_COURSE_REP_SUBJECT",
        targetType: "user",
        targetId: String(user._id),
        metadata: { subjectIds: subjects.map((s) => String(s._id)), subjectNames: subjects.map((s) => s.name) },
    });
    res.json({ user: user.toJSON() });
});
// Reverses a promotion — back to a plain student account, no longer able to
// schedule lectures. Doesn't touch anything else about the account (phone,
// password, index number, attendance history all stay exactly as they were).
exports.usersRouter.patch("/:id/demote-to-student", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const user = await User_1.User.findById(req.params.id);
    if (!user)
        throw (0, errors_1.notFound)("User");
    if (user.role !== "COURSE_REP")
        throw (0, errors_1.badRequest)("This account isn't a course rep.");
    user.role = "STUDENT";
    user.responsible_subject_ids = [];
    user.updated_at = new Date();
    await user.save();
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: "DEMOTE_COURSE_REP",
        targetType: "user",
        targetId: String(user._id),
    });
    res.json({ user: user.toJSON() });
});
