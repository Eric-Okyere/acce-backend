"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAudit = writeAudit;
const AuditLog_1 = require("../models/AuditLog");
async function writeAudit(input) {
    await AuditLog_1.AuditLog.create({
        actor_id: input.actorId,
        action: input.action,
        target_type: input.targetType ?? null,
        target_id: input.targetId ?? null,
        metadata: input.metadata ?? null,
        ip_address: input.ipAddress ?? null,
    });
}
