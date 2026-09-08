"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLog = void 0;
const mongoose_1 = require("mongoose");
const shared_1 = require("./shared");
const auditLogSchema = new mongoose_1.Schema({
    actor_id: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, required: true },
    target_type: { type: String, default: null },
    target_id: { type: String, default: null },
    metadata: { type: mongoose_1.Schema.Types.Mixed, default: null },
    ip_address: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
});
auditLogSchema.index({ created_at: -1 });
auditLogSchema.index({ target_type: 1, target_id: 1 });
(0, shared_1.applyJsonTransform)(auditLogSchema);
exports.AuditLog = (0, mongoose_1.model)("AuditLog", auditLogSchema);
