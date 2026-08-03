import { describe, expect, it } from "vitest";
import { parse } from "pgsql-ast-parser";
import {
  postgresInitialSchema,
  postgresMigrationVersions,
} from "./postgres-migrations.js";

describe("PostgreSQL migrations", () => {
  it("keeps migration versions ordered and unique", () => {
    const versions = postgresMigrationVersions();
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions[0]).toBe(1);
  });

  it("contains syntactically valid PostgreSQL statements", () => {
    expect(() => parse(postgresInitialSchema)).not.toThrow();
  });
});
