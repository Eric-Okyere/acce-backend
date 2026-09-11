"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportsRouter = void 0;
const express_1 = require("express");
const Subject_1 = require("../models/Subject");
const Lecture_1 = require("../models/Lecture");
const LectureHall_1 = require("../models/LectureHall");
const AttendanceRecord_1 = require("../models/AttendanceRecord");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const lecturePhase_1 = require("../lib/lecturePhase");
const enrollment_1 = require("../lib/enrollment");
exports.reportsRouter = (0, express_1.Router)();
// Comprehensive per-subject attendance dashboard: a teacher's own subject only
// (enforced below), or any subject for an admin.
exports.reportsRouter.get("/subjects/:id", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN", "TEACHER"), async (req, res) => {
    const subject = await Subject_1.Subject.findById(req.params.id);
    if (!subject)
        throw (0, errors_1.notFound)("Subject");
    if (req.session.role === "TEACHER" && String(subject.teacher_id) !== req.session.sub) {
        throw (0, errors_1.forbidden)("You can only view the dashboard for your own subjects.");
    }
    // Only students (and course reps) actually offering THIS subject — see
    // lib/enrollment.js — not every student in the program. Course reps
    // attend lectures and check in the same way a student does (see
    // routes/attendance.js) so they're included the same way.
    const roster = await (0, enrollment_1.getSubjectRoster)(subject);
    const allLectures = await Lecture_1.Lecture.find({ subject_id: subject._id, status: { $ne: "CANCELLED" } }).sort({
        start_time: 1,
    });
    const lectures = allLectures.filter((l) => (0, lecturePhase_1.lecturePhase)(l) === "ENDED");
    const hallIds = [...new Set(lectures.map((l) => String(l.lecture_hall_id)))];
    const halls = await LectureHall_1.LectureHall.find({ _id: { $in: hallIds } });
    const hallNameById = new Map(halls.map((h) => [String(h._id), h.name]));
    const records = await AttendanceRecord_1.AttendanceRecord.find({ lecture_id: { $in: lectures.map((l) => l._id) } });
    const recordsByLecture = new Map();
    for (const r of records) {
        const key = String(r.lecture_id);
        if (!recordsByLecture.has(key))
            recordsByLecture.set(key, new Map());
        recordsByLecture.get(key).set(String(r.student_id), r.status);
    }
    const perStudent = new Map();
    for (const s of roster)
        perStudent.set(String(s._id), { present: 0, incomplete: 0, absent: 0 });
    const lectureStats = lectures.map((lec) => {
        const byStudent = recordsByLecture.get(String(lec._id)) ?? new Map();
        let present = 0;
        let incomplete = 0;
        let absent = 0;
        for (const s of roster) {
            const status = byStudent.get(String(s._id)) ?? "ABSENT";
            if (status === "PRESENT")
                present++;
            else if (status === "INCOMPLETE")
                incomplete++;
            else
                absent++;
            const agg = perStudent.get(String(s._id));
            if (status === "PRESENT")
                agg.present++;
            else if (status === "INCOMPLETE")
                agg.incomplete++;
            else
                agg.absent++;
        }
        const total = roster.length;
        return {
            lectureId: String(lec._id),
            title: lec.title,
            startTime: lec.start_time,
            endTime: lec.end_time,
            hallName: hallNameById.get(String(lec.lecture_hall_id)) ?? "Unknown hall",
            present,
            incomplete,
            absent,
            total,
            rate: total > 0 ? Math.round((present / total) * 1000) / 10 : 0,
        };
    });
    const studentStats = roster.map((s) => {
        const agg = perStudent.get(String(s._id));
        const totalLectures = lectures.length;
        return {
            studentId: String(s._id),
            name: s.name,
            indexNumber: s.index_number,
            present: agg.present,
            incomplete: agg.incomplete,
            absent: agg.absent,
            totalLectures,
            rate: totalLectures > 0 ? Math.round((agg.present / totalLectures) * 1000) / 10 : 0,
        };
    });
    const overallPresent = studentStats.reduce((sum, s) => sum + s.present, 0);
    const overallSlots = studentStats.reduce((sum, s) => sum + s.totalLectures, 0);
    res.json({
        subjectId: String(subject._id),
        subjectName: subject.name,
        programId: String(subject.program_id),
        lectureStats,
        studentStats,
        overallRate: overallSlots > 0 ? Math.round((overallPresent / overallSlots) * 1000) / 10 : 0,
        totalLecturesHeld: lectures.length,
        rosterSize: roster.length,
    });
});
