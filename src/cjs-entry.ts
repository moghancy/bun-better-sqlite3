/**
 * CJS entry point for better-sqlite3 polyfill.
 * Knex does: const Database = require("better-sqlite3")
 * Then: new Database(filename) — so module.exports MUST be the constructor.
 */
import { Database } from "./index.ts";

module.exports = Database;
