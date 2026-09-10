"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.programsRouter = void 0;
const express_1 = require("express");
const Program_1 = require("../models/Program");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
exports.programsRouter = (0, express_1.Router)();
// Unauthenticated — the student self-registration page (auth/register-student)
// needs to show the program list before the person has any account/token.
// Deliberately minimal: id + name only, no description/source_url.
exports.programsRouter.get("/public", async (_req, res) => {
    const programs = await Program_1.Program.find().sort({ name: 1 }).select("_id name");
    res.json(programs.map((p) => ({ id: String(p._id), name: p.name })));
});
exports.programsRouter.get("/", auth_1.authenticate, async (_req, res) => {
    const programs = await Program_1.Program.find().sort({ name: 1 });
    res.json(programs.map((p) => p.toJSON()));
});
exports.programsRouter.post("/", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    const key = String(req.body?.key ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "_");
    const description = String(req.body?.description ?? "").trim();
    if (!name || !key)
        throw (0, errors_1.badRequest)("Name and key are required.");
    const program = await Program_1.Program.create({ key, name, description: description || null });
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: "CREATE_PROGRAM",
        targetType: "program",
        targetId: String(program._id),
    });
    res.status(201).json(program.toJSON());
});
