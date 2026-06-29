# bun-better-sqlite3

> Drop-in **`better-sqlite3`** API compatibility layer for **Bun** — maps the better-sqlite3 API to `bun:sqlite`.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## What is this?

Bun's runtime does not support `better-sqlite3` (the popular Node.js native C++ addon for synchronous SQLite). This package provides the **exact same API** as `better-sqlite3` but routes all calls to `bun:sqlite` (Bun's built-in synchronous SQLite — same architecture, same speed, just a different binary).

Drop-in replacement: existing code using `better-sqlite3` works unchanged. Useful for running frameworks like **Strapi**, **Knex**, **Drizzle**, or any tool that depends on better-sqlite3 under Bun.

## When you need this

- ✅ Your app runs on **Bun** and has `better-sqlite3` as a dependency
- ✅ You want the synchronous better-sqlite3-style SQLite API (not async)
- ✅ You can't change the consumer code (e.g. it's deep inside a framework)

## When you DON'T need this

- ❌ Your app runs on **Node.js** — `better-sqlite3` works natively; this polyfill would override the native implementation with a Bun-only shim
- ❌ Node.js 22+/24 — `node:sqlite` is built-in (stable in 24); prefer that
- ❌ Your app uses async SQLite (the `sqlite3` package) — different API, this won't help

## Install

Not published to npm. Install straight from GitHub with Bun:

```bash
bun add github:moghancy/bun-better-sqlite3
```

Make existing `better-sqlite3` imports resolve to it via `overrides` in your `package.json`:

```json
{
  "overrides": {
    "better-sqlite3": "github:moghancy/bun-better-sqlite3"
  }
}
```

Or swap the import directly:

```ts
// Before (won't load on Bun):
import Database from "better-sqlite3";

// After:
import Database from "bun-better-sqlite3";
```

## API Coverage

| better-sqlite3 method          | Polyfill | bun:sqlite equivalent                                                               |
| ------------------------------ | -------- | ----------------------------------------------------------------------------------- |
| `new Database(path, options?)` | ✓        | `new BunDatabase(path)`                                                             |
| `db.prepare(sql)`              | ✓        | wraps bun:sqlite Statement                                                          |
| `stmt.run(...params)`          | ✓        | returns `{ changes, lastInsertRowid }`                                              |
| `stmt.get(...params)`          | ✓        | returns single row                                                                  |
| `stmt.all(...params)`          | ✓        | returns rows array                                                                  |
| `stmt.iterate(...params)`      | ✓        | generator over `all()`                                                              |
| `stmt.columns()`               | ✓        | maps columnNames                                                                    |
| `stmt.reader`                  | ✓        | boolean: is SELECT?                                                                 |
| `db.pragma(str)`               | ✓        | runs PRAGMA via raw query                                                           |
| `db.transaction(fn)`           | ✓        | wrapper with BEGIN/COMMIT/ROLLBACK + `.deferred`/`.immediate`/`.exclusive` variants |
| `db.exec(sql)`                 | ✓        | execute raw SQL                                                                     |
| `db.close()`                   | ✓        | close connection                                                                    |
| `db.aggregate(name, options)`  | ❌       | not in bun:sqlite                                                                   |
| `db.function(name, fn)`        | ❌       | not in bun:sqlite                                                                   |
| `db.backup(path)`              | ❌       | not in bun:sqlite                                                                   |

## Limitations

The three unsupported methods (`aggregate`, `function`, `backup`) emit a `console.warn` at call time. For Strapi, Knex, and Drizzle these are not used in the hot paths.

## Why not just use `node:sqlite`?

`node:sqlite` was added in Node 22 (stable in 24). It has a slightly different API than better-sqlite3:

```ts
// node:sqlite
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.prepare("INSERT INTO t VALUES (?)").run("foo");

// better-sqlite3 / this polyfill
import Database from "better-sqlite3";
const db = new Database(":memory:");
db.prepare("INSERT INTO t VALUES (?)").run("foo");
```

The differences are minor but break drop-in replacement. For Bun users who need better-sqlite3 compatibility, this polyfill is the right answer.

## License

MIT — see [LICENSE](LICENSE).

## Author

Amir Moghaddam — [Moghancy](https://moghancy.com).
