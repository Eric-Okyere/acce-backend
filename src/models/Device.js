"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Device = void 0;
const mongoose_1 = require("mongoose");
const shared_1 = require("./shared");
const deviceSchema = new mongoose_1.Schema({
    student_id: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    device_id: { type: String, required: true },
    user_agent: { type: String, default: null },
    registered_at: { type: Date, default: Date.now },
    reset_count: { type: Number, default: 0 },
    last_reset_at: { type: Date, default: null },
    last_reset_by: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", default: null },
});
(0, shared_1.applyJsonTransform)(deviceSchema);
exports.Device = (0, mongoose_1.model)("Device", deviceSchema);
