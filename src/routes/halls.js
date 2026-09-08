"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hallsRouter = void 0;
const express_1 = require("express");
const LectureHall_1 = require("../models/LectureHall");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
const qr_1 = require("../lib/qr");
const geo_1 = require("../lib/geo");
const constants_1 = require("../lib/constants");
exports.hallsRouter = (0, express_1.Router)();
exports.hallsRouter.get("/", auth_1.authenticate, async (_req, res) => {
    const halls = await LectureHall_1.LectureHall.find({ is_active: true }).sort({ name: 1 });
    res.json(halls.map((h) => h.toJSON()));
});
exports.hallsRouter.post("/", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    const lat = Number(req.body?.latitude);
    const lng = Number(req.body?.longitude);
    const radius = Number(req.body?.radiusMeters) || constants_1.DEFAULT_GEOFENCE_RADIUS_METERS;
    if (!name)
        throw (0, errors_1.badRequest)("Hall name is required.");
    if (!(0, geo_1.isValidCoordinate)(lat, lng))
        throw (0, errors_1.badRequest)("Enter a valid latitude/longitude.");
    // Mongo needs the document's _id before we can sign a token that embeds it,
    // so create first with a placeholder, then patch in the real signed token.
    const hall = await LectureHall_1.LectureHall.create({
        name,
        latitude: lat,
        longitude: lng,
        radius_meters: radius,
        qr_token: "pending",
        created_by: req.session.sub,
    });
    hall.qr_token = (0, qr_1.signHallToken)(String(hall._id), lat, lng);
    await hall.save();
    await (0, audit_1.writeAudit)({ actorId: req.session.sub, action: "CREATE_HALL", targetType: "hall", targetId: String(hall._id) });
    res.status(201).json(hall.toJSON());
});
exports.hallsRouter.patch("/:id/location", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const lat = Number(req.body?.latitude);
    const lng = Number(req.body?.longitude);
    const radius = Number(req.body?.radiusMeters);
    if (!(0, geo_1.isValidCoordinate)(lat, lng))
        throw (0, errors_1.badRequest)("Enter a valid latitude/longitude.");
    const hall = await LectureHall_1.LectureHall.findById(req.params.id);
    if (!hall)
        throw (0, errors_1.notFound)("Lecture hall");
    hall.latitude = lat;
    hall.longitude = lng;
    if (Number.isFinite(radius) && radius > 0)
        hall.radius_meters = radius;
    hall.qr_token = (0, qr_1.signHallToken)(String(hall._id), lat, lng);
    await hall.save();
    await (0, audit_1.writeAudit)({ actorId: req.session.sub, action: "UPDATE_HALL_LOCATION", targetType: "hall", targetId: String(req.params.id) });
    res.json(hall.toJSON());
});
exports.hallsRouter.patch("/:id/active", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const isActive = Boolean(req.body?.isActive);
    const hall = await LectureHall_1.LectureHall.findByIdAndUpdate(req.params.id, { is_active: isActive }, { new: true });
    if (!hall)
        throw (0, errors_1.notFound)("Lecture hall");
    await (0, audit_1.writeAudit)({
        actorId: req.session.sub,
        action: isActive ? "ACTIVATE_HALL" : "DEACTIVATE_HALL",
        targetType: "hall",
        targetId: String(req.params.id),
    });
    res.json(hall.toJSON());
});
exports.hallsRouter.get("/:id/qr", auth_1.authenticate, (0, auth_1.requireRole)("ADMIN"), async (req, res) => {
    const hall = await LectureHall_1.LectureHall.findById(req.params.id);
    if (!hall)
        throw (0, errors_1.notFound)("Lecture hall");
    const dataUrl = await (0, qr_1.hallQrDataUrl)(hall.qr_token);
    res.json({ dataUrl, hallName: hall.name });
});
