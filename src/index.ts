/**
 * better-sqlite3 Polyfill for Bun
 *
 * Bridges the better-sqlite3 API to bun:sqlite.
 * Bun has built-in SQLite support (bun:sqlite) but many packages
 * (Strapi, Knex, Drizzle) depend on better-sqlite3 which uses
 * native C++ bindings that Bun doesn't support.
 *
 * This polyfill maps the better-sqlite3 API surface to bun:sqlite,
 * enabling these packages to run on Bun without code changes.
 *
 * API coverage: Knex dialect + Strapi core usage
 *   - new Database(filename, options)
 *   - db.prepare(sql) → Statement
 *   - stmt.run(...params) → { changes, lastInsertRowid }
 *   - stmt.get(...params) → row | undefined
 *   - stmt.all(...params) → rows[]
 *   - stmt.reader (boolean — is this a SELECT?)
 *   - db.pragma(str) → result
 *   - db.transaction(fn) → wrapped fn
 *   - db.exec(sql) → void
 *   - db.close() → void
 *
 * PHP equivalent: This is like a PDO driver adapter —
 * the application uses PDO API, the driver maps it to the actual DB.
 */
import { Database as BunDatabase } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Statement wrapper — maps better-sqlite3 Statement API to bun:sqlite.
 */
class Statement {
    private _stmt: ReturnType<BunDatabase["query"]>;
    private _isReader: boolean;

    constructor(db: BunDatabase, sql: string) {
        this._stmt = db.query(sql);
        // A statement is a "reader" if it returns columns (SELECT, PRAGMA, etc.)
        this._isReader = this._stmt.columnNames.length > 0;
    }

    /** True if this statement returns rows (SELECT, PRAGMA, RETURNING, etc.) */
    get reader(): boolean {
        return this._isReader;
    }

    /** Execute and return all rows */
    all(...params: any[]): any[] {
        const bindings = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return this._stmt.all(...bindings);
    }

    /** Execute and return first row or undefined */
    get(...params: any[]): any {
        const bindings = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return this._stmt.get(...bindings);
    }

    /** Execute (INSERT/UPDATE/DELETE) and return { changes, lastInsertRowid } */
    run(...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
        const bindings = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return this._stmt.run(...bindings) as any;
    }

    /** Iterate over result rows */
    *iterate(...params: any[]): IterableIterator<any> {
        const rows = this.all(...params);
        for (const row of rows) {
            yield row;
        }
    }

    /** Get column names */
    columns(): Array<{ name: string; column: string | null; table: string | null }> {
        return this._stmt.columnNames.map((name: string) => ({
            name,
            column: name,
            table: null,
        }));
    }

    /** Enable BigInt mode — no-op for compatibility */
    safeIntegers(_toggle?: boolean): this {
        return this;
    }

    /** Bind parameters — no-op, params passed per call in bun:sqlite */
    bind(..._params: any[]): this {
        return this;
    }

    /** Release resources */
    finalize(): void {
        this._stmt.finalize();
    }
}

/**
 * Database wrapper — maps better-sqlite3 Database to bun:sqlite.
 */
class Database {
    private _db: BunDatabase;
    readonly name: string;
    open: boolean;
    readonly memory: boolean;
    readonly inTransaction: boolean;

    constructor(
        filename: string,
        options?: {
            readonly?: boolean;
            fileMustExist?: boolean;
            timeout?: number;
            verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void;
            nativeBinding?: string;
        },
    ) {
        // Ensure parent directory exists for file-based DBs
        if (filename !== ":memory:") {
            try {
                mkdirSync(dirname(filename), { recursive: true });
            } catch {}
        }

        // bun:sqlite needs explicit flags
        const bunOptions: any = { create: true };
        if (options?.readonly) {
            bunOptions.readonly = true;
            bunOptions.create = false;
        }

        this._db = new BunDatabase(filename, bunOptions);
        this.name = filename;
        this.open = true;
        this.memory = filename === ":memory:";
        this.inTransaction = false;

        // Enable WAL mode by default (like better-sqlite3 recommends)
        this._db.run("PRAGMA journal_mode = WAL");
    }

    /** Prepare a SQL statement */
    prepare(sql: string): Statement {
        return new Statement(this._db, sql);
    }

    /** Execute raw SQL (multiple statements allowed) */
    exec(sql: string): this {
        this._db.exec(sql);
        return this;
    }

    /** Run a PRAGMA command */
    pragma(str: string, options?: { simple?: boolean }): any {
        const sql = `PRAGMA ${str}`;
        const stmt = this._db.query(sql);

        if (stmt.columnNames.length === 0) {
            stmt.run();
            return undefined;
        }

        const rows = stmt.all();
        if (options?.simple) {
            if (rows.length === 0) return undefined;
            const firstKey = Object.keys(rows[0])[0];
            return rows[0][firstKey];
        }
        return rows;
    }

    /** Create a transaction wrapper */
    transaction<T extends (...args: any[]) => any>(fn: T): T {
        const db = this._db;
        const wrapped = ((...args: any[]) => {
            db.run("BEGIN");
            try {
                const result = fn(...args);
                db.run("COMMIT");
                return result;
            } catch (err) {
                db.run("ROLLBACK");
                throw err;
            }
        }) as any;

        wrapped.deferred = wrapped;
        wrapped.immediate = ((...args: any[]) => {
            db.run("BEGIN IMMEDIATE");
            try {
                const result = fn(...args);
                db.run("COMMIT");
                return result;
            } catch (err) {
                db.run("ROLLBACK");
                throw err;
            }
        }) as any;
        wrapped.exclusive = ((...args: any[]) => {
            db.run("BEGIN EXCLUSIVE");
            try {
                const result = fn(...args);
                db.run("COMMIT");
                return result;
            } catch (err) {
                db.run("ROLLBACK");
                throw err;
            }
        }) as any;

        return wrapped as T;
    }

    /** Close the database connection */
    close(): this {
        this._db.close();
        this.open = false;
        return this;
    }

    /** Get user_version pragma */
    get userVersion(): number {
        return this.pragma("user_version", { simple: true }) as number;
    }

    /** Aggregate function — limited compatibility */
    aggregate(name: string, _options: any): this {
        console.warn(`[better-sqlite3-polyfill] aggregate("${name}") not fully supported in Bun`);
        return this;
    }

    /** Custom function — limited compatibility */
    function(name: string, _optionsOrFn: any, _fn?: any): this {
        console.warn(`[better-sqlite3-polyfill] function("${name}") not fully supported in Bun`);
        return this;
    }

    /** Backup — not available in bun:sqlite */
    backup(_filename: string, _options?: any): Promise<any> {
        console.warn(`[better-sqlite3-polyfill] backup() not supported in Bun`);
        return Promise.resolve();
    }
}

// CJS compatibility: better-sqlite3 does module.exports = Database
// Knex does: new (require("better-sqlite3"))(filename)
// So the export MUST be the constructor directly.
export default Database;
export { Database };

// Force CJS module.exports = Database (not { default: Database })
if (typeof module !== "undefined") {
    module.exports = Database;
    module.exports.default = Database;
    module.exports.Database = Database;
}
