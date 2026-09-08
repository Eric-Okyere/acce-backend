"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const env_1 = require("./env");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_1 = require("./routes/auth");
const programs_1 = require("./routes/programs");
const subjects_1 = require("./routes/subjects");
const users_1 = require("./routes/users");
const halls_1 = require("./routes/halls");
const devices_1 = require("./routes/devices");
const lectures_1 = require("./routes/lectures");
const attendance_1 = require("./routes/attendance");
const reports_1 = require("./routes/reports");
const audit_1 = require("./routes/audit");
/**
 * Builds the Express app without connecting to Mongo or starting a listener —
 * kept separate from index.ts so scripts (smoke tests, etc.) can import and
 * exercise the app in-process against a Mongoose connection they control,
 * instead of spawning a real server.
 */
function createApp() {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)({
        origin: env_1.env.FRONTEND_ORIGIN,
        credentials: true,
    }));
    app.use(express_1.default.json());
    if (env_1.env.NODE_ENV !== "test") {
        app.use((0, morgan_1.default)(env_1.env.NODE_ENV === "production" ? "combined" : "dev"));
    }
    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });
    app.use("/api/auth", auth_1.authRouter);
    app.use("/api/programs", programs_1.programsRouter);
    app.use("/api/subjects", subjects_1.subjectsRouter);
    app.use("/api/users", users_1.usersRouter);
    app.use("/api/halls", halls_1.hallsRouter);
    app.use("/api/devices", devices_1.devicesRouter);
    app.use("/api/lectures", lectures_1.lecturesRouter);
    app.use("/api/attendance", attendance_1.attendanceRouter);
    app.use("/api/reports", reports_1.reportsRouter);
    app.use("/api/audit", audit_1.auditRouter);
    // Express 5 forwards rejected promises from async handlers to error
    // middleware automatically, so no wrapper is needed around any router above.
    app.use(errorHandler_1.errorHandler);
    return app;
}
