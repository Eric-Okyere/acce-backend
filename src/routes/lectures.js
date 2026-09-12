"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lecturesRouter = void 0;
exports.lecturesAtHallForStudent = lecturesAtHallForStudent;
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
const enrollment_1 = require("../lib/enrollment");
exports.lecturesRouter = (0, express_1.Router)();
// The caller's own scheduled lectures — originally course-rep-only, now also
// used by a TEACHER or ADMIN who scheduled one themselves (see POST "/"
// below). `course_rep_id` is the historical field name (kept as-is to avoid
// a data migration) but holds whichever user actually created the lecture,
// regardless of role.
exports.lecturesRouter.get("/mine", auth_1.authenticate, (0, auth_1.requireRole)("COURSE_REP", "TEACHER", "ADMIN"), async (req, res) => {
    const lectures = await Lecture_1.Lecture.find({ course_rep_id: req.session.sub }).sort({ start_time: -1 });
    res.json(lectures.map((l) => l.toJSON()));
});
// A student's own upcoming/ongoing lectures — scoped to the courses they're
// actually offering (see lib/enrollment.js), not every subject in their program.
exports.lecturesRouter.get("/for-program/upcoming", auth_1.authenticate, (0, auth_1.requireRole)("STUDENT", "COURSE_REP"), async (req, res) => {
    const student = await User_1.User.findById(req.session.sub);
    if (!student?.program_id) {
        res.json([]);
        return;
    }
    const subjectIds = await (0, enrollment_1.subjectIdsForStudent)(student);
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
// Who can schedule a lecture, and which subjects they're allowed to schedule
// one for, depends on role:
//   - COURSE_REP: only a subject they're responsible for (assigned by an
//     admin when promoted — see routes/users.js's promote-course-rep route).
//   - TEACHER: only a subject they teach (Subject.teacher_id).
//   - ADMIN: any subject — no ownership restriction, same broad reach admin
//     already has elsewhere (deleting any user, editing any student, etc.).
// `course_rep_id` on the created Lecture stays the historical field name
// (kept as-is rather than renamed, to avoid a data migration touching every
// existing lecture) but simply holds whichever of the three actually
// scheduled it.
exports.lecturesRouter.post("/", auth_1.authenticate, (0, auth_1.requireRole)("COURSE_REP", "TEACHER", "ADMIN"), async (req, res) => {
    const role = req.session.role;
    const subjectId = String(req.body?.subjectId ?? "");
    const lectureHallId = String(req.body?.lectureHallId ?? "");
    const title = String(req.body?.title ?? "").trim();
    const startTime = String(req.body?.startTime ?? "");
    const endTime = String(req.body?.endTime ?? "");
    if (!subjectId || !lectureHallId || !startTime || !endTime) {
        throw (0, errors_1.badRequest)("Subject, hall, start time, and end time are all required.");
    }
    const subject = await Subject_1.Subject.findById(subjectId);
    if (!subject) {
        throw (0, errors_1.notFound)("Subject");
    }
    if (role === "COURSE_REP") {
        const rep = await User_1.User.findById(req.session.sub);
        if (!rep?.program_id)
            throw (0, errors_1.badRequest)("Your account isn't linked to a program — contact admin.");
        const responsibleSubjectIds = (rep.responsible_subject_ids ?? []).map((id) => String(id));
        if (responsibleSubjectIds.length === 0) {
            throw (0, errors_1.forbidden)("You haven't been assigned a subject yet — ask an admin to assign you one before scheduling lectures.", "NO_SUBJECT_ASSIGNED");
        }
        if (!responsibleSubjectIds.includes(subjectId)) {
            throw (0, errors_1.forbidden)("You can only schedule lectures for a subject you're responsible for.", "WRONG_SUBJECT");
        }
    }
    else if (role === "TEACHER") {
        if (String(subject.teacher_id) !== req.session.sub) {
            throw (0, errors_1.forbidden)("You can only schedule lectures for a subject you teach.", "WRONG_SUBJECT");
        }
    }
    // ADMIN: any subject, no further check.
    const hall = await LectureHall_1.LectureHall.findById(lectureHallId);
    if (!hall)
        throw (0, errors_1.notFound)("Lecture hall");
    const start = new Date(startTime);
    if (Number.isNaN(start.getTime()))
        throw (0, errors_1.badRequest)("Start time is invalid.");
    const end = new Date(endTime);
    if (Number.isNaN(end.getTime()))
        throw (0, errors_1.badRequest)("End time is invalid.");
    if (end.getTime() <= start.getTime()) {
        throw (0, errors_1.badRequest)("End time must be after the start time.", "INVALID_TIME_RANGE");
    }
    if (end.getTime() - start.getTime() > constants_1.MAX_LECTURE_HOURS * 60 * 60 * 1000) {
        throw (0, errors_1.badRequest)(`A lecture can't run longer than ${constants_1.MAX_LECTURE_HOURS} hours — double-check the end time (and date).`, "LECTURE_TOO_LONG");
    }
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
// COURSE_REP and TEACHER can only cancel a lecture they themselves scheduled
// (same ownership check as before, now shared by both roles). ADMIN can
// cancel any lecture, mirroring the oversight reach admin already has
// elsewhere (e.g. deleting any user's account) rather than only their own.
exports.lecturesRouter.patch("/:id/cancel", auth_1.authenticate, (0, auth_1.requireRole)("COURSE_REP", "TEACHER", "ADMIN"), async (req, res) => {
    const lecture = await Lecture_1.Lecture.findById(req.params.id);
    if (!lecture)
        throw (0, errors_1.notFound)("Lecture");
    if (req.session.role !== "ADMIN" && String(lecture.course_rep_id) !== req.session.sub) {
        throw (0, errors_1.notFound)("Lecture");
    }
    lecture.status = "CANCELLED";
    await lecture.save();
    await (0, audit_1.writeAudit)({ actorId: req.session.sub, action: "CANCEL_LECTURE", targetType: "lecture", targetId: String(req.params.id) });
    res.json(lecture.toJSON());
});
// Ending a lecture early — distinct from cancelling. Available to COURSE_REP,
// TEACHER, and ADMIN so whoever is actually running the session can close it
// out the moment it wraps, rather than waiting for the scheduled end_time.
// Ownership rule deliberately differs per role:
//  - COURSE_REP: only a lecture they themselves scheduled (course_rep_id),
//    same as cancel.
//  - TEACHER: any lecture for a subject they teach (Subject.teacher_id),
//    not just ones they personally scheduled — a teacher should be able to
//    end a lecture a course rep scheduled for their own course.
//  - ADMIN: no restriction, mirroring admin's reach elsewhere.
exports.lecturesRouter.patch("/:id/end", auth_1.authenticate, (0, auth_1.requireRole)("COURSE_REP", "TEACHER", "ADMIN"), async (req, res) => {
    const lecture = await Lecture_1.Lecture.findById(req.params.id);
    if (!lecture)
        throw (0, errors_1.notFound)("Lecture");
    if (req.session.role === "COURSE_REP" && String(lecture.course_rep_id) !== req.session.sub) {
        throw (0, errors_1.notFound)("Lecture");
    }
    if (req.session.role === "TEACHER") {
        const subject = await Subject_1.Subject.findById(lecture.subject_id);
        if (!subject || String(subject.teacher_id) !== req.session.sub) {
            throw (0, errors_1.forbidden)("You can only end lectures for subjects you teach.");
        }
    }
    if (lecture.status === "CANCELLED")
        throw (0, errors_1.badRequest)("This lecture was cancelled — it can't be ended.", "LECTURE_CANCELLED");
    if (lecture.status === "COMPLETED")
        throw (0, errors_1.badRequest)("This lecture has already ended.", "LECTURE_ENDED");
    const phase = (0, lecturePhase_1.lecturePhase)(lecture);
    if (phase === "UPCOMING")
        throw (0, errors_1.badRequest)("This lecture hasn't started yet.", "NOT_STARTED");
    if (phase === "ENDED")
        throw (0, errors_1.badRequest)("This lecture has already ended.", "LECTURE_ENDED");
    lecture.status = "COMPLETED";
    await lecture.save();
    await (0, audit_1.writeAudit)({ actorId: req.session.sub, action: "END_LECTURE", targetType: "lecture", targetId: String(req.params.id) });
    res.json(lecture.toJSON());
});
// Referenced by the student scan flow — kept here since it's still "which lectures at this hall".
// Scoped to the courses this specific student/course-rep is offering (see
// lib/enrollment.js), not every subject in their program.
async function lecturesAtHallForStudent(hallId, student) {
    const subjectIds = await (0, enrollment_1.subjectIdsForStudent)(student);
    return Lecture_1.Lecture.find({
        lecture_hall_id: hallId,
        subject_id: { $in: subjectIds },
        status: { $ne: "CANCELLED" },
    }).sort({ start_time: 1 });
}
