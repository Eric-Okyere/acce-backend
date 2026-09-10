"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// MUST be the first import — see setTestEnv.ts for why.
require("./setTestEnv");
const mongoose_1 = __importDefault(require("mongoose"));
const db_1 = require("../db");
const app_1 = require("../app");
const Program_1 = require("../models/Program");
const User_1 = require("../models/User");
const Subject_1 = require("../models/Subject");
const LectureHall_1 = require("../models/LectureHall");
const Lecture_1 = require("../models/Lecture");
const password_1 = require("../lib/password");
const qr_1 = require("../lib/qr");
let passed = 0;
let failed = 0;
function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✓ ${message}`);
    }
    else {
        failed++;
        console.error(`  ✗ ${message}`);
    }
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function main() {
    await (0, db_1.connectDb)();
    const app = (0, app_1.createApp)();
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("Could not determine test server port.");
    const base = `http://127.0.0.1:${address.port}/api`;
    async function api(method, path, body, token) {
        const res = await fetch(`${base}${path}`, {
            method,
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const json = await res.json().catch(() => null);
        return { status: res.status, json };
    }
    console.log("\n1. Bootstrap fixtures directly (program, admin, subjects, hall, second subject/teacher)");
    const program = await Program_1.Program.create({ key: "TEST_PROGRAM", name: "Test Program" });
    const otherProgram = await Program_1.Program.create({ key: "TEST_PROGRAM_2", name: "Test Program 2" });
    await User_1.User.create({
        role: "ADMIN",
        name: "Test Admin",
        phone: "0700000000",
        password_hash: await (0, password_1.hashPassword)("Admin@12345"),
    });
    const teacherA = await User_1.User.create({
        role: "TEACHER",
        name: "Teacher A",
        phone: "0700000001",
        password_hash: await (0, password_1.hashPassword)("Teacher@123"),
    });
    const teacherB = await User_1.User.create({
        role: "TEACHER",
        name: "Teacher B (other subject)",
        phone: "0700000002",
        password_hash: await (0, password_1.hashPassword)("Teacher@123"),
    });
    const rep = await User_1.User.create({
        role: "COURSE_REP",
        name: "Test Rep",
        phone: "0700000003",
        password_hash: await (0, password_1.hashPassword)("Rep@12345"),
        program_id: program._id,
        // Course reps attend lectures in their own program and check in the
        // same way a student does (see routes/attendance.js), so — like a
        // student — they need their own index number on file to verify against.
        index_number: "TEST/24/REP",
    });
    const studentA = await User_1.User.create({
        role: "STUDENT",
        name: "Student A",
        phone: "0700000004",
        password_hash: await (0, password_1.hashPassword)("Student@123"),
        program_id: program._id,
        index_number: "TEST/24/001",
    });
    const subject = await Subject_1.Subject.create({
        program_id: program._id,
        name: "Test Subject",
        teacher_id: teacherA._id,
    });
    await Subject_1.Subject.create({
        program_id: otherProgram._id,
        name: "Other Subject",
        teacher_id: teacherB._id,
    });
    const hallLat = 5.6037;
    const hallLng = -0.187;
    const hall = await LectureHall_1.LectureHall.create({
        name: "Test Hall",
        latitude: hallLat,
        longitude: hallLng,
        radius_meters: 80,
        qr_token: "pending",
    });
    hall.qr_token = (0, qr_1.signHallToken)(String(hall._id), hallLat, hallLng);
    await hall.save();
    const wrongHall = await LectureHall_1.LectureHall.create({
        name: "Wrong Hall",
        latitude: 5.61,
        longitude: -0.2,
        radius_meters: 80,
        qr_token: "pending",
    });
    wrongHall.qr_token = (0, qr_1.signHallToken)(String(wrongHall._id), 5.61, -0.2);
    await wrongHall.save();
    // Short-lived lecture: already started, ends in ~2s, so check-in is valid now
    // and checkout becomes valid ~2s from now without a long test wait.
    const now = Date.now();
    const lecture = await Lecture_1.Lecture.create({
        subject_id: subject._id,
        lecture_hall_id: hall._id,
        course_rep_id: rep._id,
        title: "Smoke Test Lecture",
        start_time: new Date(now - 5 * 60_000),
        end_time: new Date(now + 2_000),
        checkout_grace_minutes: 15,
    });
    console.log("\n2. Auth");
    const badLogin = await api("POST", "/auth/login", { phone: "0700000000", password: "wrong" });
    assert(badLogin.status === 400, "wrong password is rejected with 400");
    const adminLogin = await api("POST", "/auth/login", { phone: "0700000000", password: "Admin@12345" });
    assert(adminLogin.status === 200 && adminLogin.json.token, "admin can log in and receives a token");
    const adminToken = adminLogin.json.token;
    const studentLogin = await api("POST", "/auth/login", { phone: "0700000004", password: "Student@123" });
    assert(studentLogin.status === 200 && studentLogin.json.token, "student can log in and receives a token");
    const studentToken = studentLogin.json.token;
    const teacherALogin = await api("POST", "/auth/login", { phone: "0700000001", password: "Teacher@123" });
    const teacherAToken = teacherALogin.json.token;
    const teacherBLogin = await api("POST", "/auth/login", { phone: "0700000002", password: "Teacher@123" });
    const teacherBToken = teacherBLogin.json.token;
    console.log("\n3. Role enforcement");
    const studentTriesAdminRoute = await api("POST", "/halls", { name: "Nope", latitude: 5.6, longitude: -0.2 }, studentToken);
    assert(studentTriesAdminRoute.status === 403, "a student cannot create a lecture hall (admin-only route)");
    console.log("\n4. Check-in / check-out anti-fraud flow");
    const deviceA = "device-fingerprint-A";
    const wrongQr = await api("POST", "/attendance/check-in", { lectureId: String(lecture._id), qrToken: wrongHall.qr_token, deviceId: deviceA, lat: hallLat, lng: hallLng }, studentToken);
    assert(wrongQr.status === 400 && wrongQr.json.code === "WRONG_HALL", "checking in with the wrong hall's QR code is rejected");
    const outOfRange = await api("POST", "/attendance/check-in", { lectureId: String(lecture._id), qrToken: hall.qr_token, deviceId: deviceA, indexNumber: "TEST/24/001", lat: 0, lng: 0 }, studentToken);
    assert(outOfRange.status === 400 && outOfRange.json.code === "OUT_OF_RANGE", "checking in from far outside the geofence is rejected");
    const missingIndexNumber = await api("POST", "/attendance/check-in", { lectureId: String(lecture._id), qrToken: hall.qr_token, deviceId: deviceA, lat: hallLat, lng: hallLng }, studentToken);
    assert(missingIndexNumber.status === 400 && missingIndexNumber.json.code === "INDEX_NUMBER_REQUIRED", "checking in without an index number is rejected");
    const wrongIndexNumber = await api("POST", "/attendance/check-in", { lectureId: String(lecture._id), qrToken: hall.qr_token, deviceId: deviceA, indexNumber: "NOT/MY/NUMBER", lat: hallLat, lng: hallLng }, studentToken);
    assert(wrongIndexNumber.status === 400 && wrongIndexNumber.json.code === "INDEX_NUMBER_MISMATCH", "checking in with someone else's index number is rejected");
    const checkIn = await api("POST", "/attendance/check-in", { lectureId: String(lecture._id), qrToken: hall.qr_token, deviceId: deviceA, indexNumber: "TEST/24/001", lat: hallLat, lng: hallLng }, studentToken);
    assert(checkIn.status === 200, "student checks in successfully from the correct hall and device with their own index number");
    assert(checkIn.json.record?.status === "PRESENT", "check-in alone marks the student PRESENT (no checkout required)");
    const doubleCheckIn = await api("POST", "/attendance/check-in", { lectureId: String(lecture._id), qrToken: hall.qr_token, deviceId: deviceA, indexNumber: "TEST/24/001", lat: hallLat, lng: hallLng }, studentToken);
    assert(doubleCheckIn.status === 400 && doubleCheckIn.json.code === "ALREADY_CHECKED_IN", "checking in twice to the same lecture is rejected");
    const tooEarlyCheckout = await api("POST", "/attendance/check-out", { lectureId: String(lecture._id), qrToken: hall.qr_token, deviceId: deviceA, lat: hallLat, lng: hallLng }, studentToken);
    assert(tooEarlyCheckout.status === 400 && tooEarlyCheckout.json.code === "TOO_EARLY_CHECKOUT", "checking out before the lecture ends is rejected");
    const spoofedDeviceCheckout = await api("POST", "/attendance/check-out", { lectureId: String(lecture._id), qrToken: hall.qr_token, deviceId: "some-other-device", lat: hallLat, lng: hallLng }, studentToken);
    assert(spoofedDeviceCheckout.status === 400 && spoofedDeviceCheckout.json.code === "DEVICE_MISMATCH", "checking out from a device other than the one bound at check-in is rejected (blocks checking in for someone else)");
    console.log("  (waiting for the lecture to end so checkout opens...)");
    await sleep(2_500);
    const checkOut = await api("POST", "/attendance/check-out", { lectureId: String(lecture._id), qrToken: hall.qr_token, deviceId: deviceA, lat: hallLat, lng: hallLng }, studentToken);
    assert(checkOut.status === 200 && checkOut.json.record?.status === "PRESENT", "student checks out after the lecture ends and is marked PRESENT");
    console.log("\n5. Teacher dashboard scoping");
    const ownRoster = await api("GET", `/lectures/${lecture._id}/roster`, undefined, teacherAToken);
    assert(ownRoster.status === 200 && Array.isArray(ownRoster.json), "a teacher can view the roster for their own subject's lecture");
    const otherTeacherRoster = await api("GET", `/lectures/${lecture._id}/roster`, undefined, teacherBToken);
    assert(otherTeacherRoster.status === 403, "a teacher CANNOT view the roster for a lecture belonging to another teacher's subject");
    console.log("\n6. Device reset");
    const resetResult = await api("POST", `/devices/${studentA._id}/reset`, undefined, adminToken);
    assert(resetResult.status === 200, "admin can reset a student's device binding");
    const afterResetLecture = await Lecture_1.Lecture.create({
        subject_id: subject._id,
        lecture_hall_id: hall._id,
        course_rep_id: rep._id,
        title: "Post-reset lecture",
        start_time: new Date(Date.now() - 60_000),
        end_time: new Date(Date.now() + 10 * 60_000),
        checkout_grace_minutes: 15,
    });
    const checkInNewDevice = await api("POST", "/attendance/check-in", {
        lectureId: String(afterResetLecture._id),
        qrToken: hall.qr_token,
        deviceId: "device-fingerprint-B-new-phone",
        indexNumber: "TEST/24/001",
        lat: hallLat,
        lng: hallLng,
    }, studentToken);
    assert(checkInNewDevice.status === 200, "after an admin reset, the student can check in from a brand-new device");
    console.log("\n7. Student self-registration");
    const selfReg = await api("POST", "/auth/register-student", {
        name: "Self-Registered Student",
        phone: "0700000099",
        password: "MyOwnPass123",
        confirmPassword: "MyOwnPass123",
        programId: String(program._id),
        indexNumber: "TEST/24/099",
    });
    assert(selfReg.status === 201 && selfReg.json.token, "a student can self-register and receives a session token immediately");
    const selfRegLogin = await api("POST", "/auth/login", { phone: "0700000099", password: "MyOwnPass123" });
    assert(selfRegLogin.status === 200 && selfRegLogin.json.token, "a self-registered student can log in normally afterwards");
    const dupPhoneReg = await api("POST", "/auth/register-student", {
        name: "Duplicate Phone",
        phone: "0700000099",
        password: "AnotherPass123",
        confirmPassword: "AnotherPass123",
        programId: String(program._id),
        indexNumber: "TEST/24/100",
    });
    assert(dupPhoneReg.status === 400, "self-registration rejects a phone number that's already in use");
    const dupIndexReg = await api("POST", "/auth/register-student", {
        name: "Duplicate Index Number",
        phone: "0700000098",
        password: "AnotherPass123",
        confirmPassword: "AnotherPass123",
        programId: String(program._id),
        indexNumber: "TEST/24/099",
    });
    assert(dupIndexReg.status === 400, "self-registration rejects an index number that's already in use");
    const mismatchedPasswordsReg = await api("POST", "/auth/register-student", {
        name: "Mismatched Passwords",
        phone: "0700000097",
        password: "AnotherPass123",
        confirmPassword: "DoesNotMatch123",
        programId: String(program._id),
        indexNumber: "TEST/24/101",
    });
    assert(mismatchedPasswordsReg.status === 400, "self-registration rejects mismatched passwords");
    const publicPrograms = await api("GET", "/programs/public");
    assert(publicPrograms.status === 200 && Array.isArray(publicPrograms.json) && publicPrograms.json.length > 0, "the public program list is reachable without a token");
    // Confirms the models/User.js index_number fix actually works: a second
    // teacher/admin/course-rep with no index number at all must NOT collide
    // with each other via the sparse unique index (see the fix's comment).
    const secondTeacherNoIndexNumber = await User_1.User.create({
        role: "TEACHER",
        name: "Teacher C (no index number, regression check)",
        phone: "0700000096",
        password_hash: await (0, password_1.hashPassword)("Teacher@123"),
    });
    assert(!!secondTeacherNoIndexNumber._id, "a second user with no index number at all can still be created (sparse unique index regression check)");
    console.log("\n8. Admin password reset");
    const oldRepLoginStillWorks = await api("POST", "/auth/login", { phone: "0700000003", password: "Rep@12345" });
    assert(oldRepLoginStillWorks.status === 200, "sanity check: the course rep's original password still works before any reset");
    const resetPasswordForbiddenForRep = await api("PATCH", `/users/${rep._id}/reset-password`, undefined, studentToken);
    assert(resetPasswordForbiddenForRep.status === 403, "a non-admin cannot reset another user's password");
    const resetPasswordResult = await api("PATCH", `/users/${rep._id}/reset-password`, undefined, adminToken);
    assert(resetPasswordResult.status === 200 && typeof resetPasswordResult.json.tempPassword === "string" && resetPasswordResult.json.tempPassword.length > 0, "admin resetting a course rep's password returns a new temporary password");
    const oldRepPasswordNowRejected = await api("POST", "/auth/login", { phone: "0700000003", password: "Rep@12345" });
    assert(oldRepPasswordNowRejected.status === 400, "the course rep's old password no longer works after an admin reset");
    const newRepPasswordWorks = await api("POST", "/auth/login", { phone: "0700000003", password: resetPasswordResult.json.tempPassword });
    assert(newRepPasswordWorks.status === 200, "the course rep can log in with the new temporary password issued by the reset");
    const repToken = newRepPasswordWorks.json.token;
    console.log("\n9. Course reps attend lectures too (check in the same way a student does)");
    const teacherTriesCheckIn = await api("POST", "/attendance/check-in", {
        lectureId: String(afterResetLecture._id),
        qrToken: hall.qr_token,
        deviceId: "teacher-device",
        indexNumber: "whatever",
        lat: hallLat,
        lng: hallLng,
    }, teacherAToken);
    assert(teacherTriesCheckIn.status === 400 && teacherTriesCheckIn.json.code === "NOT_STUDENT", "a teacher still cannot check in — only students and course reps can");
    const repMissingIndexNumber = await api("POST", "/attendance/check-in", {
        lectureId: String(afterResetLecture._id),
        qrToken: hall.qr_token,
        deviceId: "rep-device-A",
        indexNumber: "NOT/THE/REP",
        lat: hallLat,
        lng: hallLng,
    }, repToken);
    assert(repMissingIndexNumber.status === 400 && repMissingIndexNumber.json.code === "INDEX_NUMBER_MISMATCH", "a course rep checking in with the wrong index number is rejected, same as a student would be");
    const repCheckIn = await api("POST", "/attendance/check-in", {
        lectureId: String(afterResetLecture._id),
        qrToken: hall.qr_token,
        deviceId: "rep-device-A",
        indexNumber: "TEST/24/REP",
        lat: hallLat,
        lng: hallLng,
    }, repToken);
    assert(repCheckIn.status === 200 && repCheckIn.json.record?.status === "PRESENT", "a course rep can check in to a lecture in their own program and is marked PRESENT");
    const rosterAfterRepCheckIn = await api("GET", `/lectures/${afterResetLecture._id}/roster`, undefined, teacherAToken);
    const repRosterEntry = rosterAfterRepCheckIn.json?.find((entry) => entry.studentId === String(rep._id));
    assert(rosterAfterRepCheckIn.status === 200 && repRosterEntry?.status === "PRESENT", "the course rep's check-in shows up on the teacher's roster for that lecture, not just their own student accounts");
    const reportAfterRepCheckIn = await api("GET", `/reports/subjects/${subject._id}`, undefined, adminToken);
    const repInReport = reportAfterRepCheckIn.json?.studentStats?.find((s) => s.studentId === String(rep._id));
    assert(reportAfterRepCheckIn.status === 200 && !!repInReport, "the course rep is counted in the subject's attendance dashboard alongside students");
    server.close();
    console.log(`\n${passed} passed, ${failed} failed.\n`);
    console.log("Cleaning up smoke test database...");
    await mongoose_1.default.connection.dropDatabase();
    await mongoose_1.default.disconnect();
    if (failed > 0)
        process.exit(1);
    process.exit(0);
}
main().catch(async (err) => {
    console.error("Smoke test crashed:", err);
    try {
        await mongoose_1.default.connection.dropDatabase();
        await mongoose_1.default.disconnect();
    }
    catch {
        // best-effort cleanup
    }
    process.exit(1);
});
