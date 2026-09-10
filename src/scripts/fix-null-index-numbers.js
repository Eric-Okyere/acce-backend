"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-time migration for the "already in use" bug fixed alongside this script
 * (see the comment on `index_number` in models/User.js for the full story).
 *
 * Any user created BEFORE that fix — including the seeded admin account, and
 * any demo teacher/course-rep from `db:seed:demo` — was saved with an explicit
 * `index_number: null`. A sparse unique index does not skip explicit nulls,
 * only a completely absent field, so those old documents are still occupying
 * the index's one allowed "no value" slot and will keep blocking every new
 * teacher/course-rep (and any student registered without an index number)
 * from being created, even after the code fix.
 *
 * This script removes the field entirely (not just sets it to null) from any
 * document where it's currently `null`, so the sparse index actually treats
 * them as absent going forward. Safe to re-run — it's a no-op once there are
 * no more `null` index numbers left. Never touches documents that already
 * have a real index number (students).
 *
 * Usage: npm run db:fix-index-numbers
 *   Run this from wherever MONGODB_URI points at the database you want fixed —
 *   e.g. Render's Shell tab for the live production database, or locally
 *   against your own .env for a local database.
 */
require("dotenv/config");
const { connectDb } = require("../db");
const { User } = require("../models/User");

async function main() {
  await connectDb();
  console.log("Connected. Looking for users with index_number explicitly set to null...");

  const affected = await User.find({ index_number: null }).select("_id name role phone");
  if (affected.length === 0) {
    console.log("None found — nothing to fix.");
    process.exit(0);
  }

  console.log(`Found ${affected.length} user(s) to fix:`);
  for (const u of affected) {
    console.log(`  - ${u.role} ${u.name} (${u.phone})`);
  }

  const result = await User.updateMany({ index_number: null }, { $unset: { index_number: "" } });
  console.log(`Done — removed the index_number field from ${result.modifiedCount} document(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
