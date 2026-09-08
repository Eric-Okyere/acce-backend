"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Lecture = void 0;
const mongoose_1 = require("mongoose");
const shared_1 = require("./shared");
const lectureSchema = new mongoose_1.Schema({
    subject_id: { type: mongoose_1.Schema.Types.ObjectId, ref: "Subject", required: true },
    lecture_hall_id: { type: mongoose_1.Schema.Types.ObjectId, ref: "LectureHall", required: true },
    course_rep_id: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, default: null },
    start_time: { type: Date, required: true },
    end_time: { type: Date, required: true },
    checkout_grace_minutes: { type: Number, default: 15 },
    status: {
        type: String,
        enum: ["SCHEDULED", "ONGOING", "COMPLETED", "CANCELLED"],
        default: "SCHEDULED",
    },
    created_at: { type: Date, default: Date.now },
});
lectureSchema.index({ subject_id: 1, start_time: 1 });
lectureSchema.index({ lecture_hall_id: 1, start_time: 1 });
lectureSchema.index({ course_rep_id: 1 });
(0, shared_1.applyJsonTransform)(lectureSchema);
exports.Lecture = (0, mongoose_1.model)("Lecture", lectureSchema);
