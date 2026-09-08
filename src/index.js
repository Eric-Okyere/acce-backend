"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./env");
const db_1 = require("./db");
const app_1 = require("./app");
async function main() {
    await (0, db_1.connectDb)();
    console.log("Connected to MongoDB.");
    const app = (0, app_1.createApp)();
    app.listen(env_1.env.PORT, () => {
        console.log(`ACCE Attendance API listening on http://localhost:${env_1.env.PORT}`);
    });
}
main().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
