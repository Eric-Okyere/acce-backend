"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLectureRoster = getLectureRoster;
const AttendanceRecord_1 = require("../models/AttendanceRecord");
const Subject_1 = require("../models/Subject");
const lecturePhase_1 = require("./lecturePhase");
const enrollment_1 = require("./enrollment");
/** Full expected roster for a lecture (every active student/course-rep offering its
 *  subject — see lib/enrollment.js), with any record. */
async function getLectureRoster(lecture) {
    const subject = await Subject_1.Subject.findById(lecture.subject_id);
    if (!subject)
        return [];
    const phase = (0, lecturePhase_1.lecturePhase)(lecture);
    const [students, records] = await Promise.all([
        (0, enrollment_1.getSubjectRoster)(subject),
        AttendanceRecord_1.AttendanceRecord.find({ lecture_id: lecture._id }),
    ]);
    const byStudent = new Map(records.map((r) => [String(r.student_id), r]));
    return students.map((s) => {
        const record = byStudent.get(String(s._id));
        let status = "ABSENT";
        if (record?.status === "PRESENT")
            status = "PRESENT";
        else if (record?.status === "INCOMPLETE")
            status = "INCOMPLETE";
        else if (phase !== "ENDED" && phase !== "CANCELLED" && record?.check_in_at)
            status = "INCOMPLETE";
        return {
            studentId: String(s._id),
            studentName: s.name,
            indexNumber: s.index_number,
            status,
            checkInAt: record?.check_in_at ?? null,
            checkOutAt: record?.check_out_at ?? null,
        };
    });
}
