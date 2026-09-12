"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subjectIdsForStudent = subjectIdsForStudent;
exports.studentOffersSubject = studentOffersSubject;
exports.getSubjectRoster = getSubjectRoster;
exports.teacherOffersStudent = teacherOffersStudent;
const User_1 = require("../models/User");
const Subject_1 = require("../models/Subject");

// --- What "offering a course" means, and why there's a fallback --------
//
// Students now pick the course(s) they're offering at registration
// (User.enrolled_subject_ids) — that's what makes their name show up on a
// teacher's roster/report for that specific subject, instead of every
// student in the same program. A course rep is also considered to be
// offering whatever subject(s) they're responsible_subject_ids for (they
// attend and check in to their own subject's lectures the same way a
// student does — see routes/attendance.js).
//
// BUT: every account created before this feature shipped has an empty
// enrolled_subject_ids (and, for a plain student, an empty
// responsible_subject_ids too). Silently dropping all of them off every
// roster the moment this deploys would be a regression, not a fix. So an
// account with NO explicit selection at all is treated as offering every
// subject in its own program — exactly how the system behaved before this
// feature existed. An admin can narrow a specific student down to their
// actual courses at any time from the Students page (PATCH /users/:id).

function hasExplicitSelection(user) {
    return (user.enrolled_subject_ids?.length ?? 0) > 0 || (user.responsible_subject_ids?.length ?? 0) > 0;
}

/** Every subject id (as strings) this student/course-rep currently "offers". */
async function subjectIdsForStudent(user) {
    if (hasExplicitSelection(user)) {
        const enrolled = (user.enrolled_subject_ids ?? []).map((id) => String(id));
        const responsible = (user.responsible_subject_ids ?? []).map((id) => String(id));
        return [...new Set([...enrolled, ...responsible])];
    }
    if (!user.program_id)
        return [];
    const subjects = await Subject_1.Subject.find({ program_id: user.program_id }).select("_id");
    return subjects.map((s) => String(s._id));
}

/** Whether this student/course-rep offers this specific subject (same program is still required). */
function studentOffersSubject(user, subject) {
    if (!user.program_id || String(user.program_id) !== String(subject.program_id))
        return false;
    if (!hasExplicitSelection(user))
        return true; // pre-feature account — unrestricted within its own program, as before
    const enrolled = (user.enrolled_subject_ids ?? []).map((id) => String(id));
    const responsible = (user.responsible_subject_ids ?? []).map((id) => String(id));
    return enrolled.includes(String(subject._id)) || responsible.includes(String(subject._id));
}

/**
 * Every active STUDENT/COURSE_REP "offering" the given subject — i.e. what a
 * teacher (or admin) should see as that course's roster. Explicit
 * enrollment/responsibility wins; accounts with no explicit selection at all
 * fall back to "same program" (see the module comment above) so existing
 * students don't silently vanish from every roster the moment this feature
 * ships.
 */
async function getSubjectRoster(subject) {
    const explicit = await User_1.User.find({
        is_active: true,
        role: { $in: ["STUDENT", "COURSE_REP"] },
        $or: [{ enrolled_subject_ids: subject._id }, { responsible_subject_ids: subject._id }],
    });
    const seen = new Set(explicit.map((u) => String(u._id)));
    const fallback = await User_1.User.find({
        is_active: true,
        role: { $in: ["STUDENT", "COURSE_REP"] },
        program_id: subject.program_id,
        enrolled_subject_ids: { $size: 0 },
        responsible_subject_ids: { $size: 0 },
    });
    const roster = [...explicit];
    for (const u of fallback) {
        if (!seen.has(String(u._id))) {
            roster.push(u);
            seen.add(String(u._id));
        }
    }
    roster.sort((a, b) => a.name.localeCompare(b.name));
    return roster;
}

/**
 * Whether this teacher may act on this student's device binding — a
 * teacher gets access to only students offering (or, for a course rep,
 * responsible for) a subject this teacher teaches, never every student in
 * the school (see routes/devices.js's teacher-scoped GET/reset). "Offering"
 * uses the same rule as everywhere else (studentOffersSubject above),
 * including its pre-feature-account fallback.
 */
async function teacherOffersStudent(teacherId, student) {
    const subjects = await Subject_1.Subject.find({ teacher_id: teacherId });
    return subjects.some((s) => studentOffersSubject(student, s));
}
