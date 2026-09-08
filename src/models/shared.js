"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyJsonTransform = applyJsonTransform;
/**
 * Applies a toJSON transform so every API response looks like
 * { id: "...", ...fields } instead of Mongo's { _id, __v }.
 *
 * Field names inside each schema are deliberately kept in snake_case
 * (program_id, is_active, check_in_at, ...) rather than idiomatic
 * camelCase. That's not an oversight — this backend was split out of an
 * existing app whose frontend already expects exactly these field names,
 * so keeping them identical here means the frontend's page components
 * needed no field-by-field rewrite, only their data-fetching swapped from
 * direct DB calls to HTTP calls. Mongo itself doesn't care either way.
 */
function applyJsonTransform(schema) {
    schema.set("toJSON", {
        virtuals: true,
        versionKey: false,
        transform: (_doc, ret) => {
            ret.id = String(ret._id);
            delete ret._id;
            return ret;
        },
    });
}
