"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_LECTURE_DURATION_HOURS = exports.AT_RISK_THRESHOLD = exports.DEFAULT_CHECKOUT_GRACE_MINUTES = exports.DEFAULT_GEOFENCE_RADIUS_METERS = exports.EARLY_CHECKIN_MINUTES = void 0;
exports.EARLY_CHECKIN_MINUTES = 120;
exports.DEFAULT_GEOFENCE_RADIUS_METERS = 80;
exports.DEFAULT_CHECKOUT_GRACE_MINUTES = 15;
exports.AT_RISK_THRESHOLD = 75;
// The lecturer (course rep, teacher, or admin) picks how many hours a
// lecture runs for, rather than typing a raw end time — see routes/lectures.js's
// POST "/", which computes end_time as start_time + durationHours from this
// fixed set of allowed lengths.
exports.VALID_LECTURE_DURATION_HOURS = [1, 2, 3, 4];
