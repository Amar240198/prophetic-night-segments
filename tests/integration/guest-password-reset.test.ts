import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  send: vi.fn(),
  limit: vi.fn(),
  delivery: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("@/lib/auth/session.server", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session.server")>()),
  createPasswordResetToken: mocks.token,
  resetPassword: mocks.reset,
}));
vi.mock("@/lib/email/delivery.server", () => ({
  emailDelivery: mocks.delivery,
  resetOrigin: () => "https://miqat.test",
}));
vi.mock("@/lib/auth/rate-limit.server", () => ({ rateLimit: mocks.limit }));
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
function request(path: string, body: unknown, origin = "https://miqat.test") {
  return new NextRequest(`https://miqat.test/api/auth/${path}`, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.delivery.mockReturnValue({ send: mocks.send });
  mocks.limit.mockResolvedValue(true);
  mocks.token.mockResolvedValue("a".repeat(64));
});
it("sends a one-hour reset link using the configured origin", async () => {
  expect((await forgot(request("forgot-password", { email: "user@example.test" }))).status).toBe(
    200,
  );
  expect(mocks.token).toHaveBeenCalledWith("user@example.test");
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "user@example.test",
      text: expect.stringContaining(`https://miqat.test/reset-password?token=${"a".repeat(64)}`),
    }),
  );
});
it("uses identical public responses for absent accounts, SMTP failure and throttling", async () => {
  const response = await (
    await forgot(request("forgot-password", { email: "user@example.test" }))
  ).json();
  mocks.token.mockResolvedValue(null);
  expect(
    await (await forgot(request("forgot-password", { email: "absent@example.test" }))).json(),
  ).toEqual(response);
  mocks.token.mockResolvedValue("a".repeat(64));
  mocks.send.mockRejectedValue(new Error("SMTP rejected"));
  expect(
    await (await forgot(request("forgot-password", { email: "user@example.test" }))).json(),
  ).toEqual(response);
  mocks.limit.mockResolvedValue(false);
  expect(
    await (await forgot(request("forgot-password", { email: "user@example.test" }))).json(),
  ).toEqual(response);
});
it("rejects missing SMTP, malformed input and cross-origin requests before token creation", async () => {
  expect((await forgot(request("forgot-password", { email: "bad" }))).status).toBe(400);
  expect(
    (await forgot(request("forgot-password", { email: "user@example.test" }, "https://other.test")))
      .status,
  ).toBe(403);
  mocks.delivery.mockImplementation(() => {
    throw new Error("EMAIL_NOT_CONFIGURED");
  });
  expect((await forgot(request("forgot-password", { email: "user@example.test" }))).status).toBe(
    503,
  );
  expect(mocks.token).not.toHaveBeenCalled();
});
it("updates a valid token and rejects expired or invalid tokens", async () => {
  mocks.reset.mockResolvedValue(true);
  const body = { token: "a".repeat(64), password: "a-new-password-123" };
  expect((await reset(request("reset-password", body))).status).toBe(200);
  expect(mocks.reset).toHaveBeenCalledWith(body.token, expect.stringMatching(/^scrypt/));
  mocks.reset.mockResolvedValue(false);
  expect((await reset(request("reset-password", body))).status).toBe(400);
  expect((await reset(request("reset-password", { password: body.password }))).status).toBe(400);
});
