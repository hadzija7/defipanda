import { describe, expect, it } from "vitest";

import { sanitizeReturnTo } from "@/lib/auth/return-to";

describe("sanitizeReturnTo", () => {
  it("accepts safe in-app relative paths", () => {
    expect(sanitizeReturnTo("/")).toBe("/");
    expect(sanitizeReturnTo("/dashboard")).toBe("/dashboard");
    expect(sanitizeReturnTo("/dashboard?tab=overview#stats")).toBe("/dashboard?tab=overview#stats");
  });

  it("falls back for protocol-relative redirects", () => {
    expect(sanitizeReturnTo("//evil.com")).toBe("/");
    expect(sanitizeReturnTo("///evil.com")).toBe("/");
  });

  it("falls back for absolute and non-path URLs", () => {
    expect(sanitizeReturnTo("https://evil.com")).toBe("/");
    expect(sanitizeReturnTo("javascript:alert(1)")).toBe("/");
  });

  it("falls back for slash/control-character tricks", () => {
    expect(sanitizeReturnTo("/\\evil.com")).toBe("/");
    expect(sanitizeReturnTo("/\t/evil.com")).toBe("/");
    expect(sanitizeReturnTo("/safe\nheader:inject")).toBe("/");
  });

  it("falls back for empty values", () => {
    expect(sanitizeReturnTo(undefined)).toBe("/");
    expect(sanitizeReturnTo(null)).toBe("/");
    expect(sanitizeReturnTo("")).toBe("/");
  });
});
