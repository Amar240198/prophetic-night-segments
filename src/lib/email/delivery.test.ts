import { afterEach, expect, it, vi } from "vitest";
const smtp = vi.hoisted(() => ({ sendMail: vi.fn(async () => ({})), create: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.create } }));
import { emailDelivery, resetOrigin } from "./delivery.server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("requires encrypted SMTP and sends the reset link through the configured provider", async () => {
  for (const [key, value] of Object.entries({
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: "587",
    SMTP_USER: "user",
    SMTP_PASSWORD: "secret",
    MAIL_FROM: "support@example.test",
  }))
    vi.stubEnv(key, value);
  smtp.create.mockReturnValue({ sendMail: smtp.sendMail });
  const message = {
    to: "user@example.test",
    subject: "Reset",
    text: "https://miqat.test/reset-password?token=test",
  };
  await emailDelivery().send(message);
  expect(smtp.create).toHaveBeenCalledWith(
    expect.objectContaining({ requireTLS: true, tls: { rejectUnauthorized: true }, port: 587 }),
  );
  expect(smtp.sendMail).toHaveBeenCalledWith({ ...message, from: "support@example.test" });
});
it("fails closed without mail configuration or with an unsafe origin", () => {
  vi.stubEnv("SMTP_HOST", "");
  expect(() => emailDelivery()).toThrow("EMAIL_NOT_CONFIGURED");
  vi.stubEnv("APP_ORIGIN", "https://user:password@example.test");
  expect(() => resetOrigin()).toThrow();
});
it("propagates delivery failure rather than reporting successful delivery", async () => {
  for (const [key, value] of Object.entries({
    SMTP_HOST: "smtp.example.test",
    SMTP_USER: "user",
    SMTP_PASSWORD: "secret",
    MAIL_FROM: "support@example.test",
  }))
    vi.stubEnv(key, value);
  smtp.create.mockReturnValue({
    sendMail: vi.fn().mockRejectedValue(new Error("delivery failed")),
  });
  await expect(
    emailDelivery().send({ to: "user@example.test", subject: "Reset", text: "reset" }),
  ).rejects.toThrow("delivery failed");
});
