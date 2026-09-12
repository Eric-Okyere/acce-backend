"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeRegExp = exports.normalizeWhitespace = void 0;
// Trims and collapses runs of internal whitespace to a single space — so
// "Mathematics", " Mathematics", and "Mathematics  Education" (typo'd
// double space) all normalize predictably before a duplicate check or before
// being stored. Doesn't touch casing — that's handled separately by callers
// that want a case-insensitive comparison (see escapeRegExp below, and
// Subject.js's collation-backed unique index).
function normalizeWhitespace(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}
exports.normalizeWhitespace = normalizeWhitespace;
// Escapes regex metacharacters so a user-supplied string (e.g. a course name)
// can be safely embedded in a `new RegExp(...)` for an exact, case-insensitive
// match — without this, a name containing `.`, `(`, `+`, etc. could match
// unintended values or throw on an invalid pattern.
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
exports.escapeRegExp = escapeRegExp;
