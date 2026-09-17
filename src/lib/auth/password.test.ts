import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.server";
describe("account password boundary", () => {
  it("hashes and verifies without storing the clear password", async () => {
    const encoded = await hashPassword("a-strong-password-123");
    expect(encoded).not.toContain("a-strong-password-123");
    expect(await verifyPassword("a-strong-password-123", encoded)).toBe(true);
    expect(await verifyPassword("wrong-password-123", encoded)).toBe(false);
  });
});
