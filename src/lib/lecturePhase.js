"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lecturePhase = lecturePhase;
function lecturePhase(lecture, now = new Date()) {
    if (lecture.status === "CANCELLED")
        return "CANCELLED";
    // A lecture manually ended early (routes/lectures.js's PATCH /:id/end —
    // admin, teacher, or course rep) is ENDED from that moment on, regardless
    // of its originally scheduled end_time, which is left untouched as a
    // historical record of what was planned.
    if (lecture.status === "COMPLETED")
        return "ENDED";
    if (now < lecture.start_time)
        return "UPCOMING";
    if (now <= lecture.end_time)
        return "ONGOING";
    return "ENDED";
}
