import { describe, expect, it } from "vitest";
import { ensureEvlogError, errors, errorToObject } from "./evlog";

describe("ensureEvlogError", () => {
  it("does not expose raw internal error messages for 500 responses", () => {
    const error = ensureEvlogError(
      new Error("database file is corrupt"),
      "Failed to fetch tweets"
    );

    expect(error.status).toBe(500);
    expect(error.why).not.toContain("database file is corrupt");
  });
});

describe("errorToObject", () => {
  it("returns generic client payloads for 500 responses", () => {
    const payload = errorToObject(
      ensureEvlogError(new Error("database file is corrupt"))
    );

    expect(payload).toEqual({
      error: "Internal server error",
      status: 500,
    });
  });

  it("preserves validation details for 400 responses", () => {
    expect(errorToObject(errors.badRequest("url", "url is invalid"))).toEqual({
      error: "Invalid url",
      fix: "Please provide a valid url",
      link: undefined,
      status: 400,
      why: "url is invalid",
    });
  });
});
