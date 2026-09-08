"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditRouter = void 0;
const express_1 = require("express");
const AuditLog_1 = require("../models/AuditLog");
const User_1 = require("../models/User");
const auth_1 = require("../middleware/auth");
exports.auditRouter = (0, express_1.Router)();
// Admin-only. GET /api/audit — most recent N entries (default 100).
// GET /api/audit?targetType=lecture&targetId=... — the trail for one target.
exports.auditRouter.get("/", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const targetType = req.query.targetType ? String(req.query.targetType) : null;
    const targetId = req.query.targetId ? String(req.query.targetId) : null;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const filter = {};
    if (targetType && targetId) {
        filter.target_type = targetType;
        filter.target_id = targetId;
    }
    const logs = await AuditLog_1.AuditLog.find(filter).sort({ created_at: -1 }).limit(limit);
    const actorIds = [...new Set(logs.map((l) => l.actor_id).filter(Boolean).map((id) => String(id)))];
    const actors = await User_1.User.find({ _id: { $in: actorIds } }).select("_id name");
    const nameById = new Map(actors.map((a) => [String(a._id), a.name]));
    res.json(logs.map((l) => ({
        ...l.toJSON(),
        actor_name: l.actor_id ? (nameById.get(String(l.actor_id)) ?? null) : null,
    })));
});
