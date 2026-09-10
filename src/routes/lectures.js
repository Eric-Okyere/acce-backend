"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lecturesRouter = void 0;
exports.lecturesAtHallForProgram = lecturesAtHallForProgram;
const express_1 = require("express");
const Lecture_1 = require("../models/Lecture");
const Subject_1 = require("../models/Subject");
const LectureHall_1 = require("../models/LectureHall");
const User_1 = require("../models/User");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
const roster_1 = require("../lib/roster");
const lecturePhase_1 = require("../lib/lecturePhase");
const constants_1 = require("../lib/constants");
exports.lecturesRouter = (0, express_1.Router)();
// Course rep's own scheduled lectures.
exports.lecturesRouter.get("/mine", auth_1.authenticate, (0, auth_1.requireRole)("COURSE_REP"), async (req, res) => {
    const lectures = await Lecture_1.Lecture.find({ course_rep_id: req.session.sub }).sort({ start_time: -1 });
    res.json(lectures.map((l) => l.toJSON()));
});
// A student's own program's upcoming/ongoing lectures.
exports.lecturesRouter.get("/for-program/upcoming", auth_1.authenticate, (0, auth_1.requireRole)("STUDENT", "COURSE_REP"), async (req, res) => {
    const student = await User_1.User.findById(req.session.sub);
    if (!student?.program_id) {
        res.json([]);
        return;
    }
    const subjects = await Subject_1.Subject.find({ program_id: student.program_id }).select("_id");
    const subjectIds = subjects.map((s) => s._id);
    const lectures = await Lecture_1.Lecture.find({ subject_id: { $in: subjectIds }, status: { $ne: "CANCELLED" } }).sort({
        start_time: 1,
    });
    const upcoming = lectures.filter((l) => {
        const phase = (0, lecturePhase_1.lecturePhase)(l);
        return phase === "UPCOMING" || phase === "ONGOING";
    });
    res.json(upcoming.slice(0, 5).map((l) => l.toJSON()));
});
exports.lecturesRouter.get("/:id", auth_1.authenticate, async (req, res) => {
    const lecture = await Lecture_1.Lecture.findById(req.params.id);
    if (!lecture)
        throw (0, errors_1.notFound)("Lecture");
    res.json(lecture.toJSON());
});
exports.lecturesRouter.get("/:id/roster", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN", "COURSE_REP", "TEACHER"), async (req, res) => {
    const lecture = await Lecture_1.Lecture.findById(req.params.id);
    if (!lecture)
        throw (0, errors_1.notFound)("Lecture");
    if (req.session.role === "COURSE_REP" && String(lecture.course_rep_id) !== req.session.sub) {
        throw (0, errors_1.forbidden)("You can only view rosters for lectures you scheduled.");
    }
    if (req.session.role === "TEACHER") {
        const subject = await Subject_1.Subject.findById(lecture.subject_id);
        if (!subject || String(subject.teacher_id) !== req.session.sub) {
            throw (0, errors_1.forbidden)("You can only view rosters for your own subjects.");
        }
    }
    const roster = await (0, roster_1.getLectureRoster)(lecture);
    res.json(roster);
});
exports.lecturesRouter.post("/", auth_1.authenticate, (0, auth_1.requireRole)("COURSE_REP"), async (req, res) => {
    const rep = await User_1.User.findById(req.session.sub);
    if (!rep?.program_id)
        throw (0, errors_1.badRequest)("Your account isn't linked to a program — contact admin.");
    const subjectId = String(req.body?.subjectId ?? "");
    const lectureHallId = String(req.body?.lectureHallId ?? "");
    const title = String(req.body?.title ?? "").trim();
    const startTime = String(req.body?.startTime ?? "");
    const endTime = String(req.body?.endTime ?? "");
    if (!subjectId || !lectureHallId || !startTime || !endTime) {
        throw (0, errors_1.badRequest)("Subject, hall, start time, and end time are all required.");
    }
    const subject = await Subject_1.Subject.findById(subjectId);
    if (!subject || String(subject.program_id) !== String(rep.program_id)) {
        throw (0, errors_1.forbidden)("You can only schedule lectures for subjects in your own program.");
    }
    const hall = await LectureHall_1.LectureHall.findById(lectureHallId);
    if (!hall)
        throw (0, errors_1.notFound)("Lecture hall");
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (end <= start)
        throw (0, errors_1.badRequest)("End time must be after start time.");
    const overlap = await Lecture_1.Lecture.findOne({
        lecture_hall_id: lectureHallId,
        status: { $ne: "CANCELLED" },
        start_time: { $lt: end },
        end_time: { $gt: start },
    });
    if (overlap) {
        throw (0, errors_1.badRequest)(`${hall.name} is already booked for another lecture during that time window.`, "HALL_DOUBLE_BOOKED");
    }
    const lecture = await Lecture_1.Lecture.create({
        subject_id: subjectId,
        lecture_hall_id: lectureHallId,
        course_rep_id: req.session.sub,
        title: title || null,
        start_time: start,
        end_time: end,
        checkout_grace_minutes: constants_1.DEFAULT_CHECKOUT_GRACE_MINUTES,
    });
    await (0, audit_1.writeAudit)({ actorId: req.session.sub, action: "CREATE_LECTURE", targetType: "lecture", targetId: String(lecture._id) });
    res.status(201).json(lecture.toJSON());
});
exports.lecturesRouter.patch("/:id/cancel", auth_1.authenticate, (0, auth_1.requireRole)("COURSE_REP"), async (req, res) => {
    const lecture = await Lecture_1.Lecture.findById(req.params.id);
    if (!lecture || String(lecture.course_rep_id) !== req.session.sub)
        throw (0, errors_1.notFound)("Lecture");
    lecture.status = "CANCELLED";
    await lecture.save();
    await (0, audit_1.writeAudit)({ actorId: req.session.sub, action: "CANCEL_LECTURE", targetType: "lecture", targetId: String(req.params.id) });
    res.json(lecture.toJSON());
});
// Referenced by the student scan flow — kept here since it's still "which lectures at this hall".
async function lecturesAtHallForProgram(hallId, programId) {
    const subjects = await Subject_1.Subject.find({ program_id: programId }).select("_id");
    const subjectIds = subjects.map((s) => s._id);
    return Lecture_1.Lecture.find({
        lecture_hall_id: hallId,
        subject_id: { $in: subjectIds },
        status: { $ne: "CANCELLED" },
    }).sort({ start_time: 1 });
}
