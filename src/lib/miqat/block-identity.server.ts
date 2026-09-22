import { createHash, createHmac } from "node:crypto";
import { googleConfig } from "@/lib/google-calendar/session.server";
export function blockProof(value: string) {
  return createHmac("sha256", googleConfig().key).update(`miqat-block-v1:${value}`).digest("hex");
}
export function blockIdentity(
  userId: string,
  connectionId: string,
  date: string,
  prayer: string,
  calendarId: string,
) {
  return createHash("sha256")
    .update(
      JSON.stringify(["miqat-prayer-block-v1", userId, connectionId, calendarId, date, prayer]),
    )
    .digest("hex");
}
