import { describe, test, expect } from "bun:test";
import Database from "../src/index.ts";

describe("bun-better-sqlite3 smoke", () => {
  test("opens an in-memory db and reports state", () => {
    const db = new Database(":memory:");
    expect(db.open).toBe(true);
    expect(db.memory).toBe(true);
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    db.close();
    expect(db.open).toBe(false);
  });

  test("prepare().run() returns { changes, lastInsertRowid }", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    const info = db.prepare("INSERT INTO t (name) VALUES (?)").run("alice");
    expect(info.changes).toBe(1);
    expect(Number(info.lastInsertRowid)).toBe(1);
    db.close();
  });

  test("get() and all() return rows", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    const insert = db.prepare("INSERT INTO t (name) VALUES (?)");
    insert.run("alice");
    insert.run("bob");

    const one = db.prepare("SELECT name FROM t WHERE id = ?").get(1);
    expect(one).toEqual({ name: "alice" });

    const rows = db.prepare("SELECT name FROM t ORDER BY id").all();
    expect(rows).toEqual([{ name: "alice" }, { name: "bob" }]);
    db.close();
  });

  test("stmt.reader distinguishes SELECT from a write", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    expect(db.prepare("SELECT 1 AS x").reader).toBe(true);
    expect(db.prepare("INSERT INTO t (id) VALUES (1)").reader).toBe(false);
    db.close();
  });

  test("iterate() yields each row", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    const insert = db.prepare("INSERT INTO t (name) VALUES (?)");
    insert.run("x");
    insert.run("y");
    const names = [
      ...db.prepare("SELECT name FROM t ORDER BY id").iterate(),
    ].map((r: any) => r.name);
    expect(names).toEqual(["x", "y"]);
    db.close();
  });

  test("transaction() commits, and rolls back on throw", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    const insert = db.prepare("INSERT INTO t (name) VALUES (?)");
    const count = () =>
      (db.prepare("SELECT COUNT(*) AS c FROM t").get() as any).c;

    const insertMany = db.transaction((names: string[]) => {
      for (const n of names) insert.run(n);
    });
    insertMany(["a", "b", "c"]);
    expect(count()).toBe(3);

    const willThrow = db.transaction(() => {
      insert.run("d");
      throw new Error("boom");
    });
    expect(() => willThrow()).toThrow("boom");
    expect(count()).toBe(3); // rolled back, "d" not persisted
    db.close();
  });

  test("pragma() returns a scalar in simple mode", () => {
    const db = new Database(":memory:");
    const journalMode = db.pragma("journal_mode", { simple: true });
    expect(typeof journalMode).toBe("string");
    db.close();
  });
});
