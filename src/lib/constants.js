"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_LECTURE_HOURS = exports.AT_RISK_THRESHOLD = exports.DEFAULT_CHECKOUT_GRACE_MINUTES = exports.DEFAULT_GEOFENCE_RADIUS_METERS = exports.EARLY_CHECKIN_MINUTES = void 0;
exports.EARLY_CHECKIN_MINUTES = 120;
exports.DEFAULT_GEOFENCE_RADIUS_METERS = 80;
exports.DEFAULT_CHECKOUT_GRACE_MINUTES = 15;
exports.AT_RISK_THRESHOLD = 75;
// As of v3.41, the lecturer (course rep, teacher, or admin) types the actual
// end time/date of their own lecture directly — see routes/lectures.js's
// POST "/", which takes endTime as-is rather than computing it from a fixed
// duration. MAX_LECTURE_HOURS is just a sanity ceiling on that raw input (an
// end time more than this many hours after the start is rejected), to catch
// an obvious mistake — e.g. picking the wrong day on the end-time picker —
// not a real pedagogical limit on how long a lecture is allowed to run.
exports.MAX_LECTURE_HOURS = 8;
