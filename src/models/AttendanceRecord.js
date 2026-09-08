"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttendanceRecord = void 0;
const mongoose_1 = require("mongoose");
const shared_1 = require("./shared");
const attendanceRecordSchema = new mongoose_1.Schema({
    lecture_id: { type: mongoose_1.Schema.Types.ObjectId, ref: "Lecture", required: true },
    student_id: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    check_in_at: { type: Date, default: null },
    check_in_lat: { type: Number, default: null },
    check_in_lng: { type: Number, default: null },
    check_in_distance_m: { type: Number, default: null },
    check_in_accuracy_m: { type: Number, default: null },
    check_out_at: { type: Date, default: null },
    check_out_lat: { type: Number, default: null },
    check_out_lng: { type: Number, default: null },
    check_out_distance_m: { type: Number, default: null },
    check_out_accuracy_m: { type: Number, default: null },
    device_id: { type: String, default: null },
    status: { type: String, enum: ["PRESENT", "INCOMPLETE", "ABSENT"], default: "INCOMPLETE" },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
});
attendanceRecordSchema.index({ lecture_id: 1, student_id: 1 }, { unique: true });
attendanceRecordSchema.index({ student_id: 1 });
(0, shared_1.applyJsonTransform)(attendanceRecordSchema);
exports.AttendanceRecord = (0, mongoose_1.model)("AttendanceRecord", attendanceRecordSchema);
