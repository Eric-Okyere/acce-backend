"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = require("mongoose");
const userSchema = new mongoose_1.Schema({
    role: { type: String, enum: ["ADMIN", "TEACHER", "COURSE_REP", "STUDENT"], required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    // NOTE: no `default: null` here on purpose. A sparse unique index only skips
    // documents where the field is completely ABSENT — it does NOT skip documents
    // where the field is present but set to `null`. If Mongoose applied a `null`
    // default to every teacher/course-rep/admin (none of whom have an index
    // number), the very first one saved would occupy the sparse index's one
    // allowed "no value" slot, and every subsequent one would fail with a
    // duplicate-key error on `index_number` — misreported to the user as their
    // PHONE NUMBER being taken, since the generic error handler (errorHandler.js)
    // can't tell which field collided. Leaving no default means the field is
    // simply omitted from the document when not provided, which is what the
    // sparse index actually needs to work correctly.
    index_number: { type: String, unique: true, sparse: true },
    program_id: { type: mongoose_1.Schema.Types.ObjectId, ref: "Program", default: null },
    // Only meaningful for role COURSE_REP: the subject(s) they're responsible
    // for scheduling lectures in (see routes/lectures.js's POST "/" handler,
    // which rejects a lecture for any subject not in this list). A course rep
    // can be assigned one or more courses — this is a list, not a single
    // value. Set only via routes/users.js's promote-course-rep /
    // demote-to-student routes — never directly at registration, since course
    // reps are no longer created directly (they're promoted from an existing
    // student account).
    responsible_subject_ids: { type: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "Subject" }], default: [] },
    // The course(s) a STUDENT says they're offering, chosen at registration
    // (or set/edited later by an admin from the Students page) — this is what
    // makes their name appear on a teacher's roster/report for that subject
    // (see lib/enrollment.js). A course rep's own enrollment (if any) is
    // additive to their responsible_subject_ids, not a replacement for it.
    // Accounts that predate this feature have an empty array here — see
    // lib/enrollment.js for the backward-compatible fallback that treats an
    // empty list as "every subject in their program", same as the system
    // behaved before course selection existed.
    enrolled_subject_ids: { type: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "Subject" }], default: [] },
    is_active: { type: Boolean, default: true },
    must_reset_password: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
});
userSchema.index({ role: 1 });
userSchema.index({ role: 1, program_id: 1 });
// Same id-mapping transform as other models, plus: never leak the password hash.
// Cast to the untyped `Schema` (rather than `Schema<UserDoc>`) for this call only —
// Mongoose's typings otherwise force the transform's `ret` to the exact
// document-with-methods shape, which is more trouble than it's worth here.
userSchema.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.password_hash;
        return ret;
    },
});
exports.User = (0, mongoose_1.model)("User", userSchema);
