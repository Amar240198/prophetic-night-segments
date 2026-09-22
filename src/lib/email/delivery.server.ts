import nodemailer from "nodemailer";
export interface EmailDelivery {
  send(input: { to: string; subject: string; text: string }): Promise<void>;
}
export function emailDelivery(): EmailDelivery {
  const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASSWORD: pass, MAIL_FROM: from } = process.env;
  const port = Number(process.env.SMTP_PORT ?? 465);
  if (!host || !user || !pass || !from || ![465, 587].includes(port) || /[\r\n]/.test(from))
    throw new Error("EMAIL_NOT_CONFIGURED");
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: { user, pass },
    connectionTimeout: 10000,
    socketTimeout: 10000,
    tls: { rejectUnauthorized: true },
  });
  return {
    async send(input) {
      await transport.sendMail({ ...input, from });
    },
  };
}
export function resetOrigin() {
  const raw = process.env.APP_ORIGIN;
  if (!raw) throw new Error("EMAIL_NOT_CONFIGURED");
  const url = new URL(raw);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && url.hostname === "localhost"))
  )
    throw new Error("EMAIL_NOT_CONFIGURED");
  return url.origin;
}
