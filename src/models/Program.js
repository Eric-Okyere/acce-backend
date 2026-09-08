"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Program = void 0;
const mongoose_1 = require("mongoose");
const shared_1 = require("./shared");
const programSchema = new mongoose_1.Schema({
    key: { type: String, required: true, unique: true }, // e.g. EARLY_CHILDHOOD
    name: { type: String, required: true },
    description: { type: String, default: null },
    source_url: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
});
(0, shared_1.applyJsonTransform)(programSchema);
exports.Program = (0, mongoose_1.model)("Program", programSchema);
