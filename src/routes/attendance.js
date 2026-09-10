"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attendanceRouter = void 0;
const express_1 = require("express");
const Lecture_1 = require("../models/Lecture");
const LectureHall_1 = require("../models/LectureHall");
const Subject_1 = require("../models/Subject");
const User_1 = require("../models/User");
const Device_1 = require("../models/Device");
const AttendanceRecord_1 = require("../models/AttendanceRecord");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
const qr_1 = require("../lib/qr");
const geo_1 = require("../lib/geo");
const lecturePhase_1 = require("../lib/lecturePhase");
const lectures_1 = require("./lectures");
const constants_1 = require("../lib/constants");
exports.attendanceRouter = (0, express_1.Router)();
/** Everything a scan (check-in or check-out) needs to validate before touching the record. */
async function validateScan(input) {
    const lecture = await Lecture_1.Lecture.findById(input.lectureId);
    if (!lecture)
        throw (0, errors_1.badRequest)("This lecture no longer exists.", "NO_LECTURE");
    if (lecture.status === "CANCELLED")
        throw (0, errors_1.badRequest)("This lecture was cancelled.", "CANCELLED");
    const payload = (0, qr_1.verifyHallToken)(input.qrToken);
    if (!payload) {
        throw (0, errors_1.badRequest)("This QR code could not be verified. Ask your course rep or admin for the official hall QR code.", "BAD_QR");
    }
    if (payload.hallId !== String(lecture.lecture_hall_id)) {
        throw (0, errors_1.badRequest)("That QR code is for a different lecture hall than the one booked for this lecture.", "WRONG_HALL");
    }
    const hall = await LectureHall_1.LectureHall.findById(payload.hallId);
    if (!hall)
        throw (0, errors_1.badRequest)("The lecture hall could not be found.", "NO_HALL");
    const subject = await Subject_1.Subject.findById(lecture.subject_id);
    if (!subject)
        throw (0, errors_1.badRequest)("The subject could not be found.", "NO_SUBJECT");
    const student = await User_1.User.findById(input.studentId);
    if (!student || !["STUDENT", "COURSE_REP"].includes(student.role))
        throw (0, errors_1.badRequest)("Only students and course reps can check in to lectures.", "NOT_STUDENT");
    if (String(student.program_id) !== String(subject.program_id)) {
        throw (0, errors_1.badRequest)("This lecture is not part of your program's timetable.", "WRONG_PROGRAM");
    }
    const distance = (0, geo_1.distanceMeters)(input.lat, input.lng, hall.latitude, hall.longitude);
    if (distance > hall.radius_meters) {
        throw (0, errors_1.badRequest)(`You're about ${Math.round(distance)}m from ${hall.name}. You must be within ${hall.radius_meters}m of the hall to check in or out.`, "OUT_OF_RANGE");
    }
    return { lecture, hall, subject, student, distance };
}
const scanBody = (req) => ({
    lectureId: String(req.body?.lectureId ?? ""),
    qrToken: String(req.body?.qrToken ?? ""),
    deviceId: String(req.body?.deviceId ?? ""),
    // Only required/checked on check-in (see below) — an extra "prove it's you"
    // step on top of already being logged in, per Eric's explicit request.
    indexNumber: String(req.body?.indexNumber ?? "").trim(),
    lat: Number(req.body?.lat),
    lng: Number(req.body?.lng),
    accuracy: req.body?.accuracy != null ? Number(req.body.accuracy) : null,
});
exports.attendanceRouter.post("/check-in", auth_1.authenticate, (0, auth_1.requireRole)("STUDENT", "COURSE_REP"), async (req, res) => {
    const input = scanBody(req);
    const studentId = req.session.sub;
    const { lecture, distance, student } = await validateScan({ ...input, studentId });
    if (!input.indexNumber) {
        throw (0, errors_1.badRequest)("Enter your student index number to check in.", "INDEX_NUMBER_REQUIRED");
    }
    if (!student.index_number || student.index_number.trim().toUpperCase() !== input.indexNumber.toUpperCase()) {
        throw (0, errors_1.badRequest)("That index number doesn't match our records for your account. Check what you typed and try again.", "INDEX_NUMBER_MISMATCH");
    }
    const now = new Date();
    const earliestAllowed = new Date(lecture.start_time.getTime() - constants_1.EARLY_CHECKIN_MINUTES * 60_000);
    if (now < earliestAllowed) {
        throw (0, errors_1.badRequest)(`Check-in opens ${constants_1.EARLY_CHECKIN_MINUTES} minutes before the lecture starts.`, "TOO_EARLY");
    }
    if (now > lecture.end_time) {
        throw (0, errors_1.badRequest)("This lecture has already ended. You can no longer check in.", "WINDOW_CLOSED");
    }
    const existing = await AttendanceRecord_1.AttendanceRecord.findOne({ lecture_id: lecture._id, student_id: studentId });
    if (existing?.check_in_at) {
        throw (0, errors_1.badRequest)("You've already checked in to this lecture.", "ALREADY_CHECKED_IN");
    }
    // Device binding: first-ever check-in binds the device; afterwards it must match.
    const device = await Device_1.Device.findOne({ student_id: studentId });
    if (device && device.device_id && device.device_id !== input.deviceId) {
        throw (0, errors_1.badRequest)("This isn't your registered device. If your phone was lost, damaged, or replaced, ask an admin to reset your device.", "DEVICE_MISMATCH");
    }
    if (device && !device.device_id) {
        device.device_id = input.deviceId;
        device.user_agent = req.headers["user-agent"] ?? null;
        device.registered_at = now;
        await device.save();
    }
    else if (!device) {
        await Device_1.Device.create({
            student_id: studentId,
            device_id: input.deviceId,
            user_agent: req.headers["user-agent"] ?? null,
        });
    }
    // Per Eric's explicit direction: checking in (QR verified + inside the
    // geofence + own index number confirmed) marks the student PRESENT
    // immediately — this is no longer a two-step "prove you stayed the whole
    // lecture" design. Check-out (below) still exists and still records a
    // departure time/location if a student uses it, but it no longer gates
    // the PRESENT status the way it used to.
    const record = await AttendanceRecord_1.AttendanceRecord.findOneAndUpdate({ lecture_id: lecture._id, student_id: studentId }, {
        check_in_at: now,
        check_in_lat: input.lat,
        check_in_lng: input.lng,
        check_in_distance_m: distance,
        check_in_accuracy_m: input.accuracy,
        device_id: input.deviceId,
        status: "PRESENT",
        updated_at: now,
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await (0, audit_1.writeAudit)({
        actorId: studentId,
        action: "CHECK_IN",
        targetType: "lecture",
        targetId: String(lecture._id),
        metadata: { distance, lat: input.lat, lng: input.lng, indexNumber: input.indexNumber },
        ipAddress: req.ip ?? null,
    });
    res.json({ success: "You're checked in and marked present for this lecture.", record: record.toJSON() });
});
exports.attendanceRouter.post("/check-out", auth_1.authenticate, (0, auth_1.requireRole)("STUDENT", "COURSE_REP"), async (req, res) => {
    const input = scanBody(req);
    const studentId = req.session.sub;
    const { lecture, distance } = await validateScan({ ...input, studentId });
    const existing = await AttendanceRecord_1.AttendanceRecord.findOne({ lecture_id: lecture._id, student_id: studentId });
    if (!existing?.check_in_at)
        throw (0, errors_1.badRequest)("You need to check in before you can check out.", "NOT_CHECKED_IN");
    if (existing.check_out_at)
        throw (0, errors_1.badRequest)("You've already checked out of this lecture.", "ALREADY_CHECKED_OUT");
    const device = await Device_1.Device.findOne({ student_id: studentId });
    if (!device || device.device_id !== input.deviceId) {
        throw (0, errors_1.badRequest)("This isn't your registered device. If your phone was lost, damaged, or replaced, ask an admin to reset your device.", "DEVICE_MISMATCH");
    }
    const now = new Date();
    const graceEnd = new Date(lecture.end_time.getTime() + lecture.checkout_grace_minutes * 60_000);
    if (now < lecture.end_time) {
        throw (0, errors_1.badRequest)(`Checkout opens exactly when the lecture ends (${lecture.end_time.toLocaleTimeString()}).`, "TOO_EARLY_CHECKOUT");
    }
    if (now > graceEnd) {
        throw (0, errors_1.badRequest)(`The checkout window closed ${lecture.checkout_grace_minutes} minutes after the lecture ended — you're still marked present, this just would have recorded your departure time.`, "CHECKOUT_WINDOW_CLOSED");
    }
    existing.check_out_at = now;
    existing.check_out_lat = input.lat;
    existing.check_out_lng = input.lng;
    existing.check_out_distance_m = distance;
    existing.check_out_accuracy_m = input.accuracy;
    existing.status = "PRESENT";
    existing.updated_at = now;
    await existing.save();
    await (0, audit_1.writeAudit)({
        actorId: studentId,
        action: "CHECK_OUT",
        targetType: "lecture",
        targetId: String(lecture._id),
        metadata: { distance, lat: input.lat, lng: input.lng },
        ipAddress: req.ip ?? null,
    });
    res.json({ success: "Checked out — your departure time has been recorded. You were already marked present at check-in.", record: existing.toJSON() });
});
// Called right after the camera decodes a hall's QR: verifies the signature and
// returns which of the student's own lectures are happening at that hall right now.
exports.attendanceRouter.post("/resolve-scan", auth_1.authenticate, (0, auth_1.requireRole)("STUDENT", "COURSE_REP"), async (req, res) => {
    const qrToken = String(req.body?.qrToken ?? "");
    const student = await User_1.User.findById(req.session.sub);
    if (!student?.program_id)
        throw (0, errors_1.badRequest)("Your account isn't linked to a program — contact admin.");
    const payload = (0, qr_1.verifyHallToken)(qrToken);
    if (!payload) {
        throw (0, errors_1.badRequest)("That QR code couldn't be verified. Make sure you're scanning the official hall poster.", "BAD_QR");
    }
    const hall = await LectureHall_1.LectureHall.findById(payload.hallId);
    if (!hall)
        throw (0, errors_1.badRequest)("That lecture hall could not be found.", "NO_HALL");
    const now = Date.now();
    const lectures = await (0, lectures_1.lecturesAtHallForProgram)(hall.id, String(student.program_id));
    const relevant = lectures.filter((l) => {
        const start = l.start_time.getTime();
        const end = l.end_time.getTime();
        const windowStart = start - constants_1.EARLY_CHECKIN_MINUTES * 60_000;
        const windowEnd = end + (l.checkout_grace_minutes + 120) * 60_000;
        return now >= windowStart && now <= windowEnd;
    });
    if (relevant.length === 0) {
        res.json({ error: `No lecture for your program is scheduled at ${hall.name} right now.`, hallName: hall.name });
        return;
    }
    const subjectIds = relevant.map((l) => l.subject_id);
    const subjects = await Subject_1.Subject.find({ _id: { $in: subjectIds } });
    const subjectNameById = new Map(subjects.map((s) => [String(s._id), s.name]));
    const records = await AttendanceRecord_1.AttendanceRecord.find({
        lecture_id: { $in: relevant.map((l) => l._id) },
        student_id: student._id,
    });
    const recordByLecture = new Map(records.map((r) => [String(r.lecture_id), r]));
    const candidates = relevant.map((l) => {
        const record = recordByLecture.get(String(l._id));
        return {
            lectureId: String(l._id),
            subjectName: subjectNameById.get(String(l.subject_id)) ?? "Unknown subject",
            startTime: l.start_time,
            endTime: l.end_time,
            phase: (0, lecturePhase_1.lecturePhase)(l),
            checkedIn: !!record?.check_in_at,
            checkedOut: !!record?.check_out_at,
        };
    });
    res.json({ hallName: hall.name, candidates });
});
exports.attendanceRouter.get("/history/me", auth_1.authenticate, (0, auth_1.requireRole)("STUDENT", "COURSE_REP"), async (req, res) => {
    const student = await User_1.User.findById(req.session.sub);
    if (!student?.program_id) {
        res.json([]);
        return;
    }
    const subjects = await Subject_1.Subject.find({ program_id: student.program_id });
    const subjectIds = subjects.map((s) => s._id);
    const subjectById = new Map(subjects.map((s) => [String(s._id), s]));
    const lectures = await Lecture_1.Lecture.find({
        subject_id: { $in: subjectIds },
        status: { $ne: "CANCELLED" },
        end_time: { $lte: new Date() },
    })
        .sort({ start_time: -1 })
        .limit(20);
    const hallIds = [...new Set(lectures.map((l) => String(l.lecture_hall_id)))];
    const halls = await LectureHall_1.LectureHall.find({ _id: { $in: hallIds } });
    const hallById = new Map(halls.map((h) => [String(h._id), h]));
    const records = await AttendanceRecord_1.AttendanceRecord.find({
        lecture_id: { $in: lectures.map((l) => l._id) },
        student_id: student._id,
    });
    const recordByLecture = new Map(records.map((r) => [String(r.lecture_id), r]));
    const history = lectures.map((l) => {
        const record = recordByLecture.get(String(l._id));
        return {
            lectureId: String(l._id),
            subjectName: subjectById.get(String(l.subject_id))?.name ?? "Unknown subject",
            hallName: hallById.get(String(l.lecture_hall_id))?.name ?? "Unknown hall",
            startTime: l.start_time,
            endTime: l.end_time,
            status: record?.status ?? "ABSENT",
            checkInAt: record?.check_in_at ?? null,
            checkOutAt: record?.check_out_at ?? null,
        };
    });
    res.json(history);
});
