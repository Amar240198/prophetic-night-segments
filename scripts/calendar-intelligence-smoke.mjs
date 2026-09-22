import assert from "node:assert/strict";
const origin = process.env.MIQAT_URL ?? "https://sixth-of-the-night.vercel.app";
async function request(path, body) {
  return fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
}
for (const path of ["/", "/sixth", "/app/calendar", "/app/prayers", "/app/sixth"]) {
  const response = await request(path);
  assert.equal(response.status, 200);
  console.log(path, 200);
}
const prayers = await request(
  "/api/prayer-times?source=aladhan&city=London&country=United%20Kingdom&date=2026-12-01",
);
assert.equal(prayers.status, 200);
const p = await prayers.json();
assert.equal(p.dailyPrayerTimes.dhuhr, "11:54");
console.log("Published winter prayer timetable: PASS");
const night = await request("/api/v1/night/calculate", {
  maghrib: p.maghrib,
  fajr: p.fajr,
  timeZone: p.timeZone,
});
assert.equal(night.status, 200);
const n = await night.json();
assert.equal(n.segments.length, 6);
assert.equal(n.segments[4].start, n.lastThird.start);
assert.equal(Date.parse(n.segments[5].end), Date.parse(p.fajr));
console.log("Canonical Sixth calculation: PASS");
for (const path of ["events", "sync", "remove"]) {
  const response = await request("/api/google-calendar/" + path, {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "CALENDAR_WRITES_DISABLED");
  console.log(path, "CALENDAR_WRITES_DISABLED");
}
for (const [path, body] of [
  ["calendars", undefined],
  ["preferences", undefined],
  ["timeline", {}],
  ["prayer-block", {}],
  ["prayer-block?action=confirm", {}],
  ["management", {}],
]) {
  const response = await request("/api/google-calendar/intelligence/" + path, body);
  assert.equal(response.status, 401);
  console.log(path, "unauthorized rejected");
}
const s = await request("/api/google-calendar/session");
assert.equal(s.status, 200);
const state = await s.json();
assert.equal(state.configured, true);
assert.equal(state.connected, false);
console.log("Google configuration present; anonymous session disconnected: PASS");
