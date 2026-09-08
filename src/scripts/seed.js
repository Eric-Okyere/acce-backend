"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Seeds the three ACCE programs and a default admin account. Safe to re-run —
 * it upserts programs by `key` and skips creating the admin if one already
 * exists with that phone number.
 *
 * Usage:
 *   npm run db:seed          # programs + admin only
 *   npm run db:seed:demo     # also creates a demo teacher, course rep,
 *                             a lecture hall, a few students, and one lecture
 */
require("dotenv/config");
const db_1 = require("../db");
const Program_1 = require("../models/Program");
const User_1 = require("../models/User");
const Subject_1 = require("../models/Subject");
const LectureHall_1 = require("../models/LectureHall");
const Lecture_1 = require("../models/Lecture");
const password_1 = require("../lib/password");
const qr_1 = require("../lib/qr");
const constants_1 = require("../lib/constants");
const PROGRAMS = [
    {
        key: "EARLY_CHILDHOOD",
        name: "Early Childhood Education",
        source_url: "https://acce.edu.gh/early-childhood/",
    },
    {
        key: "PRIMARY_EDUCATION",
        name: "Primary Education",
        source_url: "https://acce.edu.gh/primary-education/",
    },
    {
        key: "JHS_EDUCATION",
        name: "JHS Education",
        source_url: "https://acce.edu.gh/bachelor-of-education-jhs-education/",
    },
];
const ADMIN_PHONE = "0500000000";
const ADMIN_PASSWORD = "Admin@12345";
async function main() {
    await (0, db_1.connectDb)();
    console.log("Connected. Seeding...");
    for (const p of PROGRAMS) {
        await Program_1.Program.findOneAndUpdate({ key: p.key }, { $setOnInsert: { name: p.name, source_url: p.source_url, description: null } }, { upsert: true, new: true });
    }
    console.log(`Programs ready: ${PROGRAMS.map((p) => p.name).join(", ")}`);
    const existingAdmin = await User_1.User.findOne({ phone: ADMIN_PHONE });
    if (!existingAdmin) {
        await User_1.User.create({
            role: "ADMIN",
            name: "System Administrator",
            phone: ADMIN_PHONE,
            password_hash: await (0, password_1.hashPassword)(ADMIN_PASSWORD),
            must_reset_password: true,
        });
        console.log(`Admin account created — phone: ${ADMIN_PHONE}, password: ${ADMIN_PASSWORD} (change this immediately after first login).`);
    }
    else {
        console.log("Admin account already exists — skipping.");
    }
    if (process.env.SEED_DEMO === "true") {
        await seedDemoData();
    }
    console.log("Seed complete.");
    process.exit(0);
}
async function seedDemoData() {
    console.log("Seeding demo data...");
    const earlyChildhood = await Program_1.Program.findOne({ key: "EARLY_CHILDHOOD" });
    if (!earlyChildhood)
        throw new Error("Early Childhood program missing — run the base seed first.");
    const teacher = (await User_1.User.findOne({ phone: "0500000001" })) ??
        (await User_1.User.create({
            role: "TEACHER",
            name: "Mrs. Ama Boateng",
            phone: "0500000001",
            password_hash: await (0, password_1.hashPassword)("Teacher@123"),
            must_reset_password: true,
        }));
    const rep = (await User_1.User.findOne({ phone: "0500000002" })) ??
        (await User_1.User.create({
            role: "COURSE_REP",
            name: "Kofi Mensah",
            phone: "0500000002",
            password_hash: await (0, password_1.hashPassword)("Rep@12345"),
            program_id: earlyChildhood._id,
            must_reset_password: true,
        }));
    const students = [
        { name: "Abena Owusu", phone: "0500000003", index_number: "ECE/24/001" },
        { name: "Yaw Darko", phone: "0500000004", index_number: "ECE/24/002" },
        { name: "Efua Asante", phone: "0500000005", index_number: "ECE/24/003" },
    ];
    for (const s of students) {
        const existing = await User_1.User.findOne({ phone: s.phone });
        if (!existing) {
            await User_1.User.create({
                role: "STUDENT",
                name: s.name,
                phone: s.phone,
                index_number: s.index_number,
                password_hash: await (0, password_1.hashPassword)("Student@123"),
                program_id: earlyChildhood._id,
                must_reset_password: true,
            });
        }
    }
    const subject = (await Subject_1.Subject.findOne({ program_id: earlyChildhood._id, name: "Child Development" })) ??
        (await Subject_1.Subject.create({
            program_id: earlyChildhood._id,
            name: "Child Development",
            code: "ECE101",
            teacher_id: teacher._id,
        }));
    let hall = await LectureHall_1.LectureHall.findOne({ name: "Main Hall A" });
    if (!hall) {
        // Roughly ACCE's Ashanti Mampong campus — replace with real coordinates when known.
        const lat = 6.9958;
        const lng = -1.3765;
        hall = await LectureHall_1.LectureHall.create({
            name: "Main Hall A",
            latitude: lat,
            longitude: lng,
            radius_meters: constants_1.DEFAULT_GEOFENCE_RADIUS_METERS,
            qr_token: "pending",
            created_by: null,
        });
        hall.qr_token = (0, qr_1.signHallToken)(String(hall._id), lat, lng);
        await hall.save();
    }
    const existingLecture = await Lecture_1.Lecture.findOne({ subject_id: subject._id, lecture_hall_id: hall._id });
    if (!existingLecture) {
        const start = new Date();
        start.setHours(start.getHours() + 1, 0, 0, 0);
        const end = new Date(start.getTime() + 60 * 60_000);
        await Lecture_1.Lecture.create({
            subject_id: subject._id,
            lecture_hall_id: hall._id,
            course_rep_id: rep._id,
            title: "Intro to Child Development",
            start_time: start,
            end_time: end,
            checkout_grace_minutes: constants_1.DEFAULT_CHECKOUT_GRACE_MINUTES,
        });
    }
    console.log("Demo data ready:");
    console.log("  Teacher  — phone 0500000001, password Teacher@123");
    console.log("  Rep      — phone 0500000002, password Rep@12345");
    console.log("  Students — phones 0500000003-0500000005, password Student@123");
    console.log(`  Hall     — ${hall.name} (id ${hall._id})`);
}
main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});
