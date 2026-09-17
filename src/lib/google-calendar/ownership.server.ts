import { createHmac, timingSafeEqual } from "node:crypto";
import {
  CALENDAR_APPLICATION,
  type CalendarOwnershipAdapter,
  type ExternalCalendarMapping,
} from "@/lib/calendar/ownership";

export interface GoogleOwnedEvent {
  id?: string;
  status?: string;
  etag?: string;
  extendedProperties?: { private?: Record<string, string> };
}

function signingKeys(): { active: string; keys: Record<string, string> } {
  // Existing deployments already retain this secret. An explicit key ring supports
  // independent rotation without invalidating historical ownership signatures.
  const configured = process.env.CALENDAR_OWNERSHIP_KEYS;
  if (configured) {
    const value = JSON.parse(configured);
    if (
      !value ||
      typeof value.active !== "string" ||
      !/^[a-zA-Z0-9_-]{1,40}$/.test(value.active) ||
      !value.keys ||
      typeof value.keys !== "object" ||
      Array.isArray(value.keys) ||
      !Object.hasOwn(value.keys, value.active) ||
      Object.values(value.keys).some(
        (key) => typeof key !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(key),
      )
    )
      throw new Error("Invalid ownership key ring");
    return value;
  }
  const key = process.env.GOOGLE_SESSION_SECRET;
  if (!key || !/^[A-Za-z0-9+/]{43}=$/.test(key)) throw new Error("Missing ownership key");
  return { active: "session-v1", keys: { "session-v1": key } };
}

function signature(mapping: ExternalCalendarMapping, key: string): string {
  return createHmac("sha256", Buffer.from(key, "base64"))
    .update(
      JSON.stringify([
        "calendar-ownership-v1",
        CALENDAR_APPLICATION,
        mapping.appEventId,
        mapping.provider,
        mapping.accountSubject,
        mapping.connectionId,
        mapping.calendarId,
        mapping.providerEventId,
        mapping.serviceDate,
        mapping.eventKind,
      ]),
    )
    .digest("hex");
}

export function googleOwnershipMetadata(mapping: ExternalCalendarMapping): Record<string, string> {
  const { active, keys } = signingKeys();
  return {
    application: CALENDAR_APPLICATION,
    ownershipVersion: "1",
    appEventId: mapping.appEventId,
    connectionId: mapping.connectionId,
    planEvent: mapping.eventKind,
    localNight: mapping.serviceDate,
    identityScope: mapping.eventKind.startsWith("prayer-") ? "daily-prayer" : "night",
    ownershipKeyId: active,
    ownershipProof: signature(mapping, keys[active]!),
  };
}

export const googleOwnershipAdapter: CalendarOwnershipAdapter<GoogleOwnedEvent> = {
  provider: "google",
  verifyOwnership(event, mapping) {
    const p = event.extendedProperties?.private;
    if (
      mapping.ownerApplication !== CALENDAR_APPLICATION ||
      mapping.ownershipVersion !== 1 ||
      ![0, 1].includes(mapping.metadataVersion) ||
      mapping.provider !== "google" ||
      event.id !== mapping.providerEventId ||
      !p ||
      p.application !== CALENDAR_APPLICATION ||
      p.planEvent !== mapping.eventKind ||
      p.localNight !== mapping.serviceDate ||
      (p.ownershipVersion !== undefined &&
        p.identityScope !== (mapping.eventKind.startsWith("prayer-") ? "daily-prayer" : "night"))
    )
      return false;
    // A persisted legacy mapping plus matching original markers is recognized forever.
    // Once upgraded, stripping the new metadata cannot downgrade its verification.
    if (p.ownershipVersion === undefined)
      return (
        mapping.metadataVersion === 0 &&
        p.appEventId === undefined &&
        p.ownershipProof === undefined &&
        p.connectionId === undefined &&
        p.ownershipKeyId === undefined
      );
    if (
      p.ownershipVersion !== "1" ||
      p.appEventId !== mapping.appEventId ||
      p.connectionId !== mapping.connectionId ||
      !/^[0-9a-f]{64}$/.test(p.ownershipProof ?? "")
    )
      return false;
    const key = signingKeys().keys[p.ownershipKeyId ?? ""];
    return (
      Boolean(key) &&
      timingSafeEqual(
        Buffer.from(signature(mapping, key!), "hex"),
        Buffer.from(p.ownershipProof!, "hex"),
      )
    );
  },
};
