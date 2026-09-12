"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subjectsRouter = void 0;
const express_1 = require("express");
const Subject_1 = require("../models/Subject");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
const text_1 = require("../lib/text");
exports.subjectsRouter = (0, express_1.Router)();
const VALID_LEVELS = [100, 200, 300, 400];
// Case-insensitive, whitespace-normalized duplicate check for a course name
// within one program — "Mathematics", "mathematics", and " Mathematics  "
// all collide. Programs are deliberately excluded from the comparison: the
// same course name legitimately exists in more than one program (e.g.
// "English Language" in both Primary and JHS Education), so uniqueness is
// scoped per-program, matching the DB's existing compound unique index
// (program_id + name).
async function findDuplicateSubject(programId, name, excludeId) {
    const filter = {
        program_id: programId,
        name: { $regex: new RegExp(`^${(0, text_1.escapeRegExp)(name)}$`, "i") },
    };
    if (excludeId)
        filter._id = { $ne: excludeId };
    return Subject_1.Subject.findOne(filter);
}
// Case-insensitive, whitespace-normalized duplicate check for a course code —
// unlike the name check above, this is deliberately GLOBAL (no program
// scoping). A course code (e.g. "JHS-MATH-201") is a school-wide identifier,
// not a per-program label like a course name can legitimately be, so the
// same code must never appear on two different courses anywhere.
async function findDuplicateSubjectCode(code, excludeId) {
    const filter = { code: { $regex: new RegExp(`^${(0, text_1.escapeRegExp)(code)}$`, "i") } };
    if (excludeId)
        filter._id = { $ne: excludeId };
    return Subject_1.Subject.findOne(filter);
}
// Unauthenticated — same reasoning as programs/public (see routes/programs.js):
// the student self-registration page needs to show each program's course list
// (so a new student can pick which they're offering) before they have any
// account/token yet. Deliberately minimal: id + name + program_id, no teacher
// or code — a not-yet-registered visitor has no business seeing that.
exports.subjectsRouter.get("/public", async (req, res) => {
    const filter = { is_active: true };
    if (req.query.programId)
        filter.program_id = req.query.programId;
    const subjects = await Subject_1.Subject.find(filter).sort({ name: 1 }).select("_id name program_id level");
    res.json(subjects.map((s) => ({ id: String(s._id), name: s.name, programId: String(s.program_id), level: s.level ?? null })));
});
exports.subjectsRouter.get("/", auth_1.authenticate, async (req, res) => {
    const filter = { is_active: true };
    if (req.query.programId)
        filter.program_id = req.query.programId;
    if (req.query.teacherId)
        filter.teacher_id = req.query.teacherId;
    const subjects = await Subject_1.Subject.find(filter).sort({ name: 1 });
    res.json(subjects.map((s) => s.toJSON()));
});
exports.subjectsRouter.post("/", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const programId = String(req.body?.programId ?? "");
    const name = (0, text_1.normalizeWhitespace)(req.body?.name);
    const code = (0, text_1.normalizeWhitespace)(req.body?.code);
    const teacherId = String(req.body?.teacherId ?? "").trim();
    const level = Number(req.body?.level);
    if (!programId || !name)
        throw (0, errors_1.badRequest)("Program and subject name are required.");
    if (!VALID_LEVELS.includes(level))
        throw (0, errors_1.badRequest)("Choose a level for this course — 100, 200, 300 or 400.");
    // Catch case/whitespace-variant duplicates ("Mathematics" vs "mathematics ")
    // before hitting the DB — the compound unique index (program_id + name)
    // only catches an exact byte-for-byte repeat, not these.
    const duplicate = await findDuplicateSubject(programId, name);
    if (duplicate) {
        throw (0, errors_1.badRequest)(`"${duplicate.name}" already exists in this program — choose a different name, or edit the existing course instead.`, "DUPLICATE_SUBJECT");
    }
    // Course codes are optional, but when one is given it must be unique
    // school-wide (see findDuplicateSubjectCode above) — no two courses,
    // even in different programs, may share a code.
    if (code) {
        const duplicateCode = await findDuplicateSubjectCode(code);
        if (duplicateCode) {
            throw (0, errors_1.badRequest)(`Course code "${duplicateCode.code}" is already used by "${duplicateCode.name}" — course codes must be unique.`, "DUPLICATE_SUBJECT_CODE");
        }
    }
    let subject;
    try {
        subject = await Subject_1.Subject.create({
            program_id: programId,
            name,
            code: code || null,
            level,
            teacher_id: teacherId || null,
        });
    }
    catch (e) {
        // Narrow race: two admins submit the identical name (or code) at
        // almost the same moment, both pass the checks above, and the DB's
        // own unique index (program_id + name) rejects the second insert.
        // Same friendly message as the pre-check, not the generic "That
        // value is already in use." from the global error handler. (There's
        // no DB-level unique index on `code` — see the comment on the
        // schema field in models/Subject.js — so a code race isn't caught
        // here, only the pre-check above; low-risk for an admin-only,
        // low-frequency action.)
        if (e && typeof e === "object" && "code" in e && e.code === 11000) {
            throw (0, errors_1.badRequest)(`"${name}" already exists in this program — choose a different name, or edit the existing course instead.`, "DUPLICATE_SUBJECT");
        }
        throw e;
    }
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: "CREATE_SUBJECT",
        targetType: "subject",
        targetId: String(subject._id),
    });
    res.status(201).json(subject.toJSON());
});
exports.subjectsRouter.patch("/:id/teacher", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const teacherId = String(req.body?.teacherId ?? "").trim();
    const subject = await Subject_1.Subject.findByIdAndUpdate(req.params.id, { teacher_id: teacherId || null }, { new: true });
    if (!subject)
        throw (0, errors_1.notFound)("Subject");
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: "ASSIGN_TEACHER",
        targetType: "subject",
        targetId: String(req.params.id),
    });
    res.json(subject.toJSON());
});
exports.subjectsRouter.patch("/:id/level", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const level = Number(req.body?.level);
    if (!VALID_LEVELS.includes(level))
        throw (0, errors_1.badRequest)("Choose a level for this course — 100, 200, 300 or 400.");
    const subject = await Subject_1.Subject.findByIdAndUpdate(req.params.id, { level }, { new: true });
    if (!subject)
        throw (0, errors_1.notFound)("Subject");
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: "SET_SUBJECT_LEVEL",
        targetType: "subject",
        targetId: String(req.params.id),
        metadata: { level },
    });
    res.json(subject.toJSON());
});
exports.subjectsRouter.patch("/:id/active", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const isActive = Boolean(req.body?.isActive);
    const subject = await Subject_1.Subject.findByIdAndUpdate(req.params.id, { is_active: isActive }, { new: true });
    if (!subject)
        throw (0, errors_1.notFound)("Subject");
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: isActive ? "ACTIVATE_SUBJECT" : "DEACTIVATE_SUBJECT",
        targetType: "subject",
        targetId: String(req.params.id),
    });
    res.json(subject.toJSON());
});
