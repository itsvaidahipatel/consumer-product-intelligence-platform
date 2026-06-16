import { describe, expect, it } from "vitest";
import { assertParsableDatabaseUrl } from "./database-url.js";

describe("assertParsableDatabaseUrl", () => {
  it("accepts encoded special characters in password", () => {
    expect(() =>
      assertParsableDatabaseUrl("postgresql://postgres:p%23%40%3A@localhost:5432/postgres"),
    ).not.toThrow();
  });

  it("rejects raw # in password (fragment delimiter)", () => {
    expect(() =>
      assertParsableDatabaseUrl("postgresql://postgres:bad#@localhost:5432/postgres"),
    ).toThrow(/encode them in the connection string/);
  });
});
