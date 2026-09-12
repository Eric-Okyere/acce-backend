"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Subject = void 0;
const mongoose_1 = require("mongoose");
const shared_1 = require("./shared");
const subjectSchema = new mongoose_1.Schema({
    program_id: { type: mongoose_1.Schema.Types.ObjectId, ref: "Program", required: true },
    name: { type: String, required: true },
    code: { type: String, default: null },
    // Which year/level this course belongs to — 100 (year 1) through 400
    // (year 4). Nullable so subjects created before this field existed keep
    // reading fine; new subjects are required to set one (see routes/subjects.js).
    level: { type: Number, enum: [100, 200, 300, 400], default: null },
    teacher_id: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", default: null },
    is_active: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now },
});
subjectSchema.index({ program_id: 1, name: 1 }, { unique: true });
subjectSchema.index({ teacher_id: 1 });
(0, shared_1.applyJsonTransform)(subjectSchema);
exports.Subject = (0, mongoose_1.model)("Subject", subjectSchema);
