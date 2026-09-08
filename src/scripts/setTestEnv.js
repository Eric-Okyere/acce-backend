"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Forces the smoke test onto a dedicated "_smoketest" database on the same
 * cluster, and MUST be the very first import in smoketest.ts (before any
 * module that imports ../env) — module evaluation order in Node runs this
 * file's top-level code before env.ts reads process.env.MONGODB_URI, so the
 * override below is what env.ts actually sees. Importing it later would be
 * too late: env.ts would have already read (and locked in) the real URI.
 *
 * This mirrors a lesson learned in an earlier version of this project: a
 * smoke test that connects to whatever database is configured by default
 * will silently pollute real data unless it's forced onto its own database.
 */
require("dotenv/config");
const raw = process.env.MONGODB_URI;
if (!raw) {
    throw new Error("MONGODB_URI is not set — copy .env.example to .env and fill it in before running the smoke test.");
}
const url = new URL(raw.replace("mongodb+srv://", "https://").replace("mongodb://", "http://"));
const dbName = (url.pathname.replace(/^\//, "") || "acce_attendance") + "_smoketest";
url.pathname = `/${dbName}`;
const rebuilt = url
    .toString()
    .replace("https://", "mongodb+srv://")
    .replace("http://", "mongodb://");
if (!dbName.includes("smoketest")) {
    // Should be unreachable given the concat above, but this is the guard that
    // actually matters: never let this script run against a non-test database.
    throw new Error("Refusing to run smoke test: computed database name doesn't include 'smoketest'.");
}
process.env.MONGODB_URI = rebuilt;
process.env.NODE_ENV = "test";
console.log(`[smoketest] Using database "${dbName}" (isolated from your real data).`);
