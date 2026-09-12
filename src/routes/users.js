"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = void 0;
const express_1 = require("express");
const User_1 = require("../models/User");
const Subject_1 = require("../models/Subject");
const Program_1 = require("../models/Program");
const Device_1 = require("../models/Device");
const AttendanceRecord_1 = require("../models/AttendanceRecord");
const phone_1 = require("../lib/phone");
const password_1 = require("../lib/password");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
const enrollment_1 = require("../lib/enrollment");
exports.usersRouter = (0, express_1.Router)();
const VALID_ROLES = ["ADMIN", "TEACHER", "COURSE_REP", "STUDENT"];
const VALID_LEVELS = [100, 200, 300, 400];
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
// Self-service: a STUDENT (or COURSE_REP) sets/changes which courses THEY say
// they're offering — separate from the admin-only PATCH "/:id" below, since a
// student obviously can't call an ADMIN-only route on their own account. This
// is what powers the "choose your courses" prompt on the student dashboard
// for an account that hasn't picked any yet (or wants to change its picks)
// without needing to go through an admin. Always a full replacement of the
// list, same convention as everywhere else subjects are assigned
// (promote-course-rep, the admin edit route) — and, unlike those, requires at
// least one course: an empty list here would just put the account right back
// into lib/enrollment.js's "offering everything in the program" fallback,
// silently undoing the whole point of asking.
exports.usersRouter.patch("/me/subjects", auth_1.authenticate, (0, auth_1.requireRole)("STUDENT", "COURSE_REP"), async (req, res) => {
    const rawSubjectIds = Array.isArray(req.body?.subjectIds) ? req.body.subjectIds : [];
    const subjectIds = [...new Set(rawSubjectIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
    if (subjectIds.length === 0) {
        throw (0, errors_1.badRequest)("Choose at least one course you're offering.");
    }
    const user = await User_1.User.findById(req.session.sub);
    if (!user)
        throw (0, errors_1.notFound)("User");
    if (!user.program_id) {
        throw (0, errors_1.badRequest)("Your account isn't linked to a program — contact admin.");
    }
    const subjects = await Subject_1.Subject.find({ _id: { $in: subjectIds } });
    if (subjects.length !== subjectIds.length) {
        throw (0, errors_1.notFound)("Subject");
    }
    const wrongProgramSubject = subjects.find((s) => String(s.program_id) !== String(user.program_id));
    if (wrongProgramSubject) {
        throw (0, errors_1.badRequest)(`"${wrongProgramSubject.name}" isn't a course in your program.`);
    }
    user.enrolled_subject_ids = subjects.map((s) => s._id);
    user.updated_at = new Date();
    await user.save();
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: "UPDATE_OWN_SUBJECTS",
        targetType: "user",
        targetId: String(user._id),
        metadata: { subjectIds: subjects.map((s) => String(s._id)), subjectNames: subjects.map((s) => s.name) },
    });
    res.json({ user: user.toJSON() });
});
// Self-service: a STUDENT (or COURSE_REP) sets/changes their own level (100,
// 200, 300 or 400) — separate from the admin-only PATCH "/:id" below, same
// reasoning as "/me/subjects" above. Powers the "choose your level" prompt on
// the student dashboard for an account that predates this field (or an admin
// cleared it).
exports.usersRouter.patch("/me/level", auth_1.authenticate, (0, auth_1.requireRole)("STUDENT", "COURSE_REP"), async (req, res) => {
    const level = Number(req.body?.level);
    if (!VALID_LEVELS.includes(level)) {
        throw (0, errors_1.badRequest)("Choose your level — 100, 200, 300 or 400.");
    }
    const user = await User_1.User.findById(req.session.sub);
    if (!user)
        throw (0, errors_1.notFound)("User");
    user.level = level;
    user.updated_at = new Date();
    await user.save();
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: "UPDATE_OWN_LEVEL",
        targetType: "user",
        targetId: String(user._id),
        metadata: { level },
    });
    res.json({ user: user.toJSON() });
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
    const rawLevel = req.body?.level;
    const level = rawLevel !== undefined && rawLevel !== null && rawLevel !== "" ? Number(rawLevel) : null;
    const rawSubjectIds = Array.isArray(req.body?.subjectIds) ? req.body.subjectIds : [];
    const subjectIds = [...new Set(rawSubjectIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
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
    if (level !== null && !VALID_LEVELS.includes(level)) {
        throw (0, errors_1.badRequest)("Level must be 100, 200, 300 or 400.");
    }
    // The courses this student is offering are optional here (unlike
    // self-registration — see routes/auth.js) since an admin may not know
    // them yet; left empty, lib/enrollment.js falls back to treating the
    // student as offering every subject in their program, same as before
    // this feature existed. If subjects ARE given, they must belong to the
    // chosen program.
    let subjects = [];
    if (role === "STUDENT" && subjectIds.length > 0) {
        subjects = await Subject_1.Subject.find({ _id: { $in: subjectIds } });
        if (subjects.length !== subjectIds.length) {
            throw (0, errors_1.notFound)("Subject");
        }
        const wrongProgramSubject = subjects.find((s) => String(s.program_id) !== programId);
        if (wrongProgramSubject) {
            throw (0, errors_1.badRequest)(`"${wrongProgramSubject.name}" isn't a course in the selected program.`);
        }
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
        level,
        enrolled_subject_ids: subjects.map((s) => s._id),
    });
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: `CREATE_${role}`,
        targetType: "user",
        targetId: String(user._id),
    });
    res.status(201).json({ user: user.toJSON(), tempPassword });
});
// General admin edit — name, phone, index number, program, and (for a
// student) which courses they're offering. Built for the Students page's
// "Edit" control; every field is optional in the request body EXCEPT
// subjectIds, which — like promote-course-rep — is always a full replacement
// of the list whenever the key is present at all (even an empty array), so
// the admin's checkbox form can clear every selection back to "none picked"
// (which lib/enrollment.js then treats as "offering everything in their
// program", same fallback as a never-updated account). Admin accounts can't
// be edited here — this route is for teacher/course-rep/student housekeeping.
exports.usersRouter.patch("/:id", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const user = await User_1.User.findById(req.params.id);
    if (!user)
        throw (0, errors_1.notFound)("User");
    if (user.role === "ADMIN") {
        throw (0, errors_1.badRequest)("Admin accounts can't be edited from here.");
    }
    if (req.body?.name !== undefined) {
        const name = String(req.body.name).trim();
        if (!name)
            throw (0, errors_1.badRequest)("Name can't be empty.");
        user.name = name;
    }
    if (req.body?.phone !== undefined) {
        const phone = String(req.body.phone).trim();
        if (!phone)
            throw (0, errors_1.badRequest)("Phone number can't be empty.");
        const normalizedPhone = (0, phone_1.normalizePhone)(phone);
        const clash = await User_1.User.findOne({ phone: normalizedPhone, _id: { $ne: user._id } });
        if (clash)
            throw (0, errors_1.badRequest)("Another account already uses this phone number.");
        user.phone = normalizedPhone;
    }
    if (req.body?.indexNumber !== undefined) {
        const indexNumber = String(req.body.indexNumber).trim();
        if (indexNumber) {
            const clash = await User_1.User.findOne({ index_number: indexNumber, _id: { $ne: user._id } });
            if (clash)
                throw (0, errors_1.badRequest)("That index number is already in use by someone else.", "INDEX_NUMBER_TAKEN");
            user.index_number = indexNumber;
        }
    }
    if (req.body?.level !== undefined) {
        const level = req.body.level === null || req.body.level === "" ? null : Number(req.body.level);
        if (level !== null && !VALID_LEVELS.includes(level)) {
            throw (0, errors_1.badRequest)("Level must be 100, 200, 300 or 400.");
        }
        user.level = level;
    }
    let effectiveProgramId = user.program_id ? String(user.program_id) : "";
    if (req.body?.programId !== undefined) {
        const programId = String(req.body.programId).trim();
        if (!programId)
            throw (0, errors_1.badRequest)("A program is required.");
        const program = await Program_1.Program.findById(programId).catch(() => null);
        if (!program)
            throw (0, errors_1.badRequest)("Choose a valid program.");
        user.program_id = program._id;
        effectiveProgramId = String(program._id);
    }
    if (Array.isArray(req.body?.subjectIds)) {
        const subjectIds = [...new Set(req.body.subjectIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
        if (subjectIds.length > 0) {
            const subjects = await Subject_1.Subject.find({ _id: { $in: subjectIds } });
            if (subjects.length !== subjectIds.length) {
                throw (0, errors_1.notFound)("Subject");
            }
            const wrongProgramSubject = subjects.find((s) => String(s.program_id) !== effectiveProgramId);
            if (wrongProgramSubject) {
                throw (0, errors_1.badRequest)(`"${wrongProgramSubject.name}" isn't a course in this student's program.`);
            }
        }
        user.enrolled_subject_ids = subjectIds;
    }
    user.updated_at = new Date();
    await user.save();
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: "UPDATE_USER",
        targetType: "user",
        targetId: String(user._id),
    });
    res.json({ user: user.toJSON() });
});
// Admin deletes a user outright — mainly for the Students page (a duplicate
// or mistakenly self-registered account). Blocked for admin accounts and for
// deleting yourself, as a safety rail. A STUDENT is additionally blocked
// unless they've completed their program (level 400) — per Eric's direction,
// deleting a student is meant for graduated accounts, not as a general-purpose
// "remove anyone" tool; deactivating (PATCH /:id/active) is still available
// for a student who needs to be taken off the roster before then. This gate
// deliberately does NOT apply to TEACHER or COURSE_REP — "student" was asked
// for specifically, and a course rep especially may need removing regardless
// of level (e.g. a bad promotion) without waiting on a "completed" state that
// isn't really about them anymore once promoted. Their device binding and
// attendance history are deleted too — orphaned records tied to a gone
// account's id serve no purpose and would just look like a bug (a "ghost"
// roster entry) anywhere they're referenced. Lectures and audit log entries
// the user authored/appears in are left as historical record.
exports.usersRouter.delete("/:id", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const user = await User_1.User.findById(req.params.id);
    if (!user)
        throw (0, errors_1.notFound)("User");
    if (user.role === "ADMIN") {
        throw (0, errors_1.badRequest)("Admin accounts can't be deleted.");
    }
    if (String(user._id) === req.session.sub) {
        throw (0, errors_1.badRequest)("You can't delete your own account.");
    }
    if (user.role === "STUDENT" && user.level !== 400) {
        throw (0, errors_1.badRequest)(`${user.name} hasn't completed their program yet (${user.level ? `currently level ${user.level}` : "no level on file"}) — only students at level 400 can be deleted. Deactivate them instead if they need to be taken off the roster now.`, "NOT_COMPLETED");
    }
    await Promise.all([
        Device_1.Device.deleteOne({ student_id: user._id }),
        AttendanceRecord_1.AttendanceRecord.deleteMany({ student_id: user._id }),
    ]);
    await user.deleteOne();
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: "DELETE_USER",
        targetType: "user",
        targetId: String(req.params.id),
        metadata: { name: user.name, phone: user.phone, role: user.role },
    });
    res.json({ success: true });
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
// Also usable by a TEACHER, scoped the same way as their device-reset
// access (routes/devices.js) — only for a STUDENT/COURSE_REP offering (or
// responsible for) a subject this teacher teaches, never for another
// teacher's or an admin's account. This is the "forgot my password" escape
// hatch a teacher can now hand a student directly (see the WhatsApp/SMS
// share on the frontend's ResetPasswordButton) without routing every case
// through an admin.
exports.usersRouter.patch("/:id/reset-password", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN", "TEACHER"), async (req, res) => {
    const user = await User_1.User.findById(req.params.id);
    if (!user)
        throw (0, errors_1.notFound)("User");
    if (req.session.role === "TEACHER") {
        const isStudentLike = user.role === "STUDENT" || user.role === "COURSE_REP";
        if (!isStudentLike || !(await (0, enrollment_1.teacherOffersStudent)(req.session.sub, user))) {
            throw (0, errors_1.forbidden)("You can only reset the password of a student offering a course you teach.");
        }
    }
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
