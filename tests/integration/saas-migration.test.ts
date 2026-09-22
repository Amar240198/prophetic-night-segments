import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import { DEFAULT_AUTOMATION } from "@/lib/automation/config";

it("upgrades pre-009 accounts without changing connections, selections, preferences or entitlements", async () => {
  const db = new PGlite();
  try {
    const files = readdirSync("migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files.filter((f) => Number(f.slice(0, 3)) <= 8))
      await db.exec(readFileSync(`migrations/${file}`, "utf8"));
    const user = "11111111-1111-4111-8111-111111111111";
    const connection = "22222222-2222-4222-8222-222222222222";
    const config = {
      ...DEFAULT_AUTOMATION,
      horizon: 60,
      onboardingComplete: true,
      fasting: ["monday", "thursday"],
    };
    await db.query(
      "INSERT INTO miqaat_users(id,email,password_hash) VALUES($1,'upgrade@example.invalid',$2)",
      [user, "x".repeat(60)],
    );
    await db.query(
      "INSERT INTO miqaat_preferences(user_id,prayer_source,fasting_settings,prayer_analysis) VALUES($1,'aladhan',$2::jsonb,$3::jsonb)",
      [user, JSON.stringify({ selected: ["monday"] }), JSON.stringify({ bufferBefore: 12 })],
    );
    await db.query("INSERT INTO miqaat_entitlements(user_id) VALUES($1)", [user]);
    await db.query(
      "INSERT INTO google_connections(id,user_id,google_subject,google_account_email,encrypted_access_token,encrypted_refresh_token,access_token_expires_at,granted_scopes) VALUES($1,$2,'subject','upgrade@example.invalid','encrypted-access','encrypted-refresh',now()+interval '1 hour','https://www.googleapis.com/auth/calendar.readonly')",
      [connection, user],
    );
    await db.query(
      "INSERT INTO calendar_preferences(connection_id,provider,calendar_id,read_enabled,write_enabled) VALUES($1,'google','chosen-calendar',true,true)",
      [connection],
    );
    await db.query(
      "INSERT INTO miqaat_automation(user_id,google_connection_id,configuration,enabled) VALUES($1,$2,$3::jsonb,true)",
      [user, connection, JSON.stringify(config)],
    );
    const before = {} as Record<string, unknown>;
    for (const table of ["google_connections", "calendar_preferences", "miqaat_automation"])
      before[table] = (await db.query(`SELECT * FROM ${table}`)).rows;
    for (const file of files.filter((f) => Number(f.slice(0, 3)) >= 9))
      await db.exec(readFileSync(`migrations/${file}`, "utf8"));
    for (const table of Object.keys(before))
      expect((await db.query(`SELECT * FROM ${table}`)).rows).toEqual(before[table]);
    expect(
      (
        await db.query(
          "SELECT prayer_configuration,onboarding_step,fasting_settings,prayer_analysis FROM miqaat_preferences",
        )
      ).rows[0],
    ).toEqual({
      prayer_configuration: { source: config.source, timezone: config.timezone },
      onboarding_step: "complete",
      fasting_settings: { selected: ["monday"] },
      prayer_analysis: { bufferBefore: 12 },
    });
    expect(
      (
        await db.query(
          "SELECT plan,status,provider_customer_id,provider_subscription_id FROM miqaat_entitlements",
        )
      ).rows[0],
    ).toEqual({
      plan: "FREE",
      status: "active",
      provider_customer_id: null,
      provider_subscription_id: null,
    });
    await db.query(
      "UPDATE miqaat_entitlements SET provider_customer_id='cus_unique',provider_subscription_id='sub_unique' WHERE user_id=$1",
      [user],
    );
    const other = "33333333-3333-4333-8333-333333333333";
    await db.query(
      "INSERT INTO miqaat_users(id,email,password_hash) VALUES($1,'other@example.invalid',$2)",
      [other, "x".repeat(60)],
    );
    await expect(
      db.query(
        "INSERT INTO miqaat_entitlements(user_id,provider_customer_id) VALUES($1,'cus_unique')",
        [other],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "INSERT INTO miqaat_entitlements(user_id,provider_subscription_id) VALUES($1,'sub_unique')",
        [other],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "INSERT INTO miqaat_stripe_events(stripe_event_id,event_type,livemode,user_id) VALUES('evt_wrong','test',false,$1)",
        ["44444444-4444-4444-8444-444444444444"],
      ),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 60000);
