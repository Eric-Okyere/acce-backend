"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subjectsRouter = void 0;
const express_1 = require("express");
const Subject_1 = require("../models/Subject");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
exports.subjectsRouter = (0, express_1.Router)();
// Unauthenticated — same reasoning as programs/public (see routes/programs.js):
// the student self-registration page needs to show each program's course list
// (so a new student can pick which they're offering) before they have any
// account/token yet. Deliberately minimal: id + name + program_id, no teacher
// or code — a not-yet-registered visitor has no business seeing that.
exports.subjectsRouter.get("/public", async (req, res) => {
    const filter = { is_active: true };
    if (req.query.programId)
        filter.program_id = req.query.programId;
    const subjects = await Subject_1.Subject.find(filter).sort({ name: 1 }).select("_id name program_id");
    res.json(subjects.map((s) => ({ id: String(s._id), name: s.name, programId: String(s.program_id) })));
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
    const name = String(req.body?.name ?? "").trim();
    const code = String(req.body?.code ?? "").trim();
    const teacherId = String(req.body?.teacherId ?? "").trim();
    if (!programId || !name)
        throw (0, errors_1.badRequest)("Program and subject name are required.");
    const subject = await Subject_1.Subject.create({
        program_id: programId,
        name,
        code: code || null,
        teacher_id: teacherId || null,
    });
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
