"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lecturePhase = lecturePhase;
function lecturePhase(lecture, now = new Date()) {
    if (lecture.status === "CANCELLED")
        return "CANCELLED";
    if (now < lecture.start_time)
        return "UPCOMING";
    if (now <= lecture.end_time)
        return "ONGOING";
    return "ENDED";
}
