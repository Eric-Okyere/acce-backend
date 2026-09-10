"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.devicesRouter = void 0;
const express_1 = require("express");
const Device_1 = require("../models/Device");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../lib/audit");
exports.devicesRouter = (0, express_1.Router)();
exports.devicesRouter.get("/me", auth_1.authenticate, (0, auth_1.requireRole)("STUDENT", "COURSE_REP"), async (req, res) => {
    const device = await Device_1.Device.findOne({ student_id: req.session.sub });
    res.json(device ? device.toJSON() : null);
});
// Admin lookup of a specific student's device binding — used by the admin
// students table. Registered before "/:studentId/reset" doesn't matter here
// since the methods differ, but this must stay below the literal "/me" route
// above so "GET /me" isn't swallowed by this param route.
exports.devicesRouter.get("/:studentId", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const device = await Device_1.Device.findOne({ student_id: req.params.studentId });
    res.json(device ? device.toJSON() : null);
});
exports.devicesRouter.post("/:studentId/reset", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    await Device_1.Device.updateOne({ student_id: req.params.studentId }, {
        $set: { device_id: "", last_reset_at: new Date(), last_reset_by: req.session.sub },
        $inc: { reset_count: 1 },
    });
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: "RESET_DEVICE",
        targetType: "user",
        targetId: String(req.params.studentId),
    });
    res.json({ success: true });
});
