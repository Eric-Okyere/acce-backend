"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.devicesRouter = void 0;
const express_1 = require("express");
const Device_1 = require("../models/Device");
const User_1 = require("../models/User");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
const enrollment_1 = require("../lib/enrollment");
exports.devicesRouter = (0, express_1.Router)();
exports.devicesRouter.get("/me", auth_1.authenticate, (0, auth_1.requireRole)("STUDENT", "COURSE_REP"), async (req, res) => {
    const device = await Device_1.Device.findOne({ student_id: req.session.sub });
    res.json(device ? device.toJSON() : null);
});
// A TEACHER gets access to only the device binding of a student/course-rep
// offering (or responsible for) a subject THIS teacher teaches — never
// every student in the school, unlike ADMIN's unrestricted reach. This
// shared check is used by both routes below. Fetches the target user itself
// (rather than trusting the caller) since ownership depends on the current
// state of their enrollment, not anything the request body can assert.
async function assertTeacherMayManage(req, studentId) {
    if (req.session.role === "ADMIN")
        return;
    const student = await User_1.User.findById(studentId);
    if (!student)
        throw (0, errors_1.notFound)("Student");
    const allowed = await (0, enrollment_1.teacherOffersStudent)(req.session.sub, student);
    if (!allowed) {
        throw (0, errors_1.forbidden)("You can only manage the device of a student offering a course you teach.");
    }
}
// Admin lookup of a specific student's device binding — used by the admin
// students table. Registered before "/:studentId/reset" doesn't matter here
// since the methods differ, but this must stay below the literal "/me" route
// above so "GET /me" isn't swallowed by this param route. Extended to
// TEACHER (scoped to their own students, see assertTeacherMayManage above)
// so a teacher can see whether a student's phone needs resetting before
// asking an admin to do it — this route is now the same one the teacher
// students page reads from.
exports.devicesRouter.get("/:studentId", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN", "TEACHER"), async (req, res) => {
    await assertTeacherMayManage(req, req.params.studentId);
    const device = await Device_1.Device.findOne({ student_id: req.params.studentId });
    res.json(device ? device.toJSON() : null);
});
// Extended to TEACHER the same way as the lookup above — a teacher can now
// reset the device of a student who's a spoiled/replaced phone away from
// missing their own lectures, without needing to route it through an admin
// first, but still only for a student offering a course this teacher teaches.
exports.devicesRouter.post("/:studentId/reset", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN", "TEACHER"), async (req, res) => {
    await assertTeacherMayManage(req, req.params.studentId);
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
