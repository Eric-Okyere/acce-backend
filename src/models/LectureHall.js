"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LectureHall = void 0;
const mongoose_1 = require("mongoose");
const shared_1 = require("./shared");
const lectureHallSchema = new mongoose_1.Schema({
    name: { type: String, required: true, unique: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    radius_meters: { type: Number, default: 80 },
    qr_token: { type: String, required: true, unique: true },
    is_active: { type: Boolean, default: true },
    created_by: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", default: null },
    created_at: { type: Date, default: Date.now },
});
(0, shared_1.applyJsonTransform)(lectureHallSchema);
exports.LectureHall = (0, mongoose_1.model)("LectureHall", lectureHallSchema);
