// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, usePathname: () => "/app" }));
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { SharedHeader } from "@/components/app/SharedHeader";
import { AppShell } from "@/components/app/AppShell";
import { QaylulaCard } from "@/components/app/QaylulaCard";
import { PublicWorkspace } from "@/components/app/PublicWorkspace";
import { AuthForm } from "@/components/product/AuthForm";
import { DEFAULT_QAYLULA } from "@/lib/routines/qaylula";
import { parseLocale } from "@/lib/i18n/config";
const schedule = {
  date: "2026-10-01",
  timeZone: "UTC",
  source: "Test provider",
  fajr: "2026-10-01T05:00:00Z",
  sunrise: "2026-10-01T06:00:00Z",
  dhuhr: "2026-10-01T13:02:00Z",
  asr: "2026-10-01T16:00:00Z",
  maghrib: "2026-10-01T18:00:00Z",
  isha: "2026-10-01T20:00:00Z",
};
beforeEach(() => {
  sessionStorage.clear();
  document.cookie = "miqat_locale=; Max-Age=0; Path=/";
  window.history.replaceState({}, "", "/app");
  navigation.push.mockClear();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("renders Dhuhr controls for guests and reacts to before, after, offset, duration and provider changes", () => {
  const view = render(<QaylulaCard schedule={schedule} />);
  expect(screen.getByLabelText("Anchor")).toHaveValue("Dhuhr");
  fireEvent.change(screen.getByLabelText("When"), { target: { value: "before" } });
  fireEvent.change(screen.getByLabelText("Offset (minutes)"), { target: { value: "30" } });
  expect(screen.getByText(/12:32 – 12:52/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("When"), { target: { value: "after" } });
  fireEvent.change(screen.getByLabelText("Offset (minutes)"), { target: { value: "20" } });
  fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value: "30" } });
  expect(screen.getByText(/13:22 – 13:52/)).toBeInTheDocument();
  view.rerender(
    <QaylulaCard
      schedule={{ ...schedule, dhuhr: "2026-10-01T12:59:00Z", source: "Changed location" }}
    />,
  );
  expect(screen.getByText(/13:19 – 13:49/)).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("preserves valid local drafts across remounts and rejects malformed restored data", () => {
  const view = render(<QaylulaCard schedule={schedule} />);
  fireEvent.change(screen.getByLabelText("Offset (minutes)"), { target: { value: "60" } });
  view.unmount();
  const restored = render(<QaylulaCard schedule={schedule} />);
  expect(screen.getByLabelText("Offset (minutes)")).toHaveValue(60);
  restored.unmount();
  sessionStorage.setItem(
    "miqat.qaylula.v1",
    JSON.stringify({ ...DEFAULT_QAYLULA, offsetMinutes: -40 }),
  );
  render(<QaylulaCard schedule={schedule} />);
  expect(screen.getByLabelText("Offset (minutes)")).toHaveValue(15);
});
it("requires sign-in only for Save and preserves the exact Qaylula intent", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 401 }));
  render(<QaylulaCard schedule={schedule} />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("When"), { target: { value: "before" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Qaylula to account" }));
  await waitFor(() =>
    expect(navigation.push).toHaveBeenCalledWith(
      "/sign-in?next=%2Fsixth%3Froutine%3Dqaylula%23qaylula",
    ),
  );
  expect(JSON.parse(sessionStorage.getItem("miqat.qaylula-save.v1")!).relation).toBe("before");
});
it("resumes an explicit save through the existing API after authentication", async () => {
  window.history.replaceState({}, "", "/sixth?routine=qaylula");
  sessionStorage.setItem(
    "miqat.qaylula-save.v1",
    JSON.stringify({ ...DEFAULT_QAYLULA, offsetMinutes: 45 }),
  );
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(JSON.stringify({ routines: [] })))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ routine: { id: "saved" } }), { status: 201 }),
    );
  render(
    <React.StrictMode>
      <QaylulaCard schedule={schedule} />
    </React.StrictMode>,
  );
  await screen.findByText("Qaylula saved to your account.");
  expect(fetch).toHaveBeenCalledTimes(2);
  const body = JSON.parse(vi.mocked(fetch).mock.calls[1]![1]!.body as string);
  expect(body.timing).toEqual({ kind: "relative", anchor: "dhuhr", offsetMinutes: 45 });
  expect(body.calendarSyncEnabled).toBe(false);
  expect(sessionStorage.getItem("miqat.qaylula-save.v1")).toBeNull();
});
it("preserves the advanced-routines entitlement restriction", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 403 }));
  render(<QaylulaCard schedule={schedule} />);
  fireEvent.click(screen.getByRole("button", { name: "Save Qaylula to account" }));
  await screen.findByText("Advanced routines are available with Miqāt Pro.");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("switches the shared header, navigation and Qaylula to Arabic RTL and back without auth", async () => {
  const tree = (
    <>
      <SharedHeader />
      <AppShell>
        <QaylulaCard schedule={schedule} />
      </AppShell>
    </>
  );
  const view = render(<LocaleProvider>{tree}</LocaleProvider>);
  expect(document.documentElement).toHaveAttribute("lang", "en");
  expect(document.documentElement).toHaveAttribute("dir", "ltr");
  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "ar" } });
  await waitFor(() => expect(document.documentElement).toHaveAttribute("dir", "rtl"));
  expect(document.documentElement).toHaveAttribute("lang", "ar");
  expect(screen.getByRole("heading", { name: "القيلولة" })).toBeInTheDocument();
  expect(screen.getByLabelText("المرتكز")).toHaveValue("الظهر");
  expect(
    within(screen.getByRole("navigation", { name: "التنقل على الهاتف" })).getAllByRole("link"),
  ).toHaveLength(5);
  expect(document.cookie).toContain("miqat_locale=ar");
  view.unmount();
  const cookie = document.cookie
    .split("; ")
    .find((v) => v.startsWith("miqat_locale="))
    ?.split("=")[1];
  render(<LocaleProvider initialLocale={parseLocale(cookie)}>{tree}</LocaleProvider>);
  expect(screen.getByRole("combobox", { name: "اللغة" })).toHaveValue("ar");
  fireEvent.change(screen.getByRole("combobox", { name: "اللغة" }), { target: { value: "en" } });
  expect(document.documentElement).toHaveAttribute("lang", "en");
  expect(document.documentElement).toHaveAttribute("dir", "ltr");
  expect(fetch).not.toHaveBeenCalled();
});
it("calculates the public night in Arabic without making an authenticated request", async () => {
  render(
    <LocaleProvider initialLocale="ar">
      <PublicWorkspace />
    </LocaleProvider>,
  );
  fireEvent.change(screen.getByLabelText("مصدر مواقيت الصلاة"), { target: { value: "manual" } });
  fireEvent.change(screen.getByLabelText("التاريخ"), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText("المغرب"), { target: { value: "18:00" } });
  fireEvent.change(screen.getByLabelText(/الفجر التالي/), { target: { value: "06:00" } });
  fireEvent.click(screen.getByRole("button", { name: "احسب هذه الليلة" }));
  await screen.findByRole("heading", { name: "التقسيم المعتاد لليل" });
  expect(screen.getByText("منتصف الليل")).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps safe auth return paths while translating auth UI", async () => {
  window.history.replaceState({}, "", "/sign-in?next=%2Fsixth%3Froutine%3Dqaylula%23qaylula");
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ user: { id: "test" } })));
  render(
    <LocaleProvider initialLocale="ar">
      <AuthForm mode="signin" />
    </LocaleProvider>,
  );
  fireEvent.change(screen.getByLabelText("البريد الإلكتروني"), {
    target: { value: "test@example.invalid" },
  });
  fireEvent.change(screen.getByLabelText("كلمة المرور"), {
    target: { value: "test-password-123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
  await waitFor(() =>
    expect(navigation.push).toHaveBeenCalledWith("/sixth?routine=qaylula#qaylula"),
  );
});
it("uses the public coordinate provider's civil Dhuhr, location and timezone in Qaylula", async () => {
  const response = (dhuhr: string, timeZone: string) =>
    Response.json({
      input: { maghrib: "2026-10-01T18:00:00Z", fajr: "2026-10-02T06:00:00Z", timeZone },
      prayerTimes: {
        provider: "Test provider",
        calculationMethod: "Test method",
        timeZone,
        dailyPrayerTimes: {
          serviceDate: "2026-10-01",
          fajr: "05:00",
          sunrise: "06:00",
          dhuhr,
          asr: "16:00",
          maghrib: "18:00",
          isha: "20:00",
        },
      },
    });
  vi.mocked(fetch).mockImplementation(async (url) =>
    String(url).includes("calculate-from-coordinates")
      ? response("13:00", "UTC")
      : Response.json({ connected: false }),
  );
  render(<PublicWorkspace />);
  fireEvent.change(screen.getByLabelText("Prayer-time source"), {
    target: { value: "coordinates" },
  });
  fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "51.5" } });
  fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "0.1" } });
  fireEvent.change(screen.getByLabelText("Service date"), { target: { value: "2026-10-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Calculate this night" }));
  await screen.findByText(/13:15 – 13:35/);
  vi.mocked(fetch).mockImplementation(async (url) =>
    String(url).includes("calculate-from-coordinates")
      ? response("12:57", "Asia/Riyadh")
      : Response.json({ connected: false }),
  );
  fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "24.7" } });
  fireEvent.click(screen.getByRole("button", { name: "Calculate this night" }));
  await screen.findByText(/13:12 – 13:32/);
  expect(
    within(screen.getByRole("region", { name: "Qaylula" })).getByText("Asia/Riyadh"),
  ).toBeInTheDocument();
});
it("preserves existing routine name, recurrence and calendar/reminder preferences when saving", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      Response.json({
        routines: [
          {
            id: "saved",
            type: "qaylula",
            name: "My rest",
            recurrence: "selected-weekdays",
            weekdays: [1, 3],
            calendar_sync_enabled: true,
            notification_minutes: 10,
          },
        ],
      }),
    )
    .mockResolvedValueOnce(Response.json({ ok: true }));
  render(<QaylulaCard schedule={schedule} />);
  fireEvent.click(screen.getByRole("button", { name: "Save Qaylula to account" }));
  await screen.findByText("Qaylula saved to your account.");
  expect(JSON.parse(vi.mocked(fetch).mock.calls[1]![1]!.body as string)).toMatchObject({
    name: "My rest",
    recurrence: "selected-weekdays",
    weekdays: [1, 3],
    calendarSyncEnabled: true,
    notificationMinutes: 10,
  });
});
it("does not choose an arbitrary existing Qaylula to overwrite", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ routines: [{ type: "qaylula" }, { type: "qaylula" }] }),
  );
  render(<QaylulaCard schedule={schedule} />);
  fireEvent.click(screen.getByRole("button", { name: "Save Qaylula to account" }));
  await screen.findByText("You have multiple Qaylula routines. Choose one to edit in Automations.");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("does not resume a forged intent or invalid pending draft", async () => {
  window.history.replaceState({}, "", "/sixth?routine=qaylula");
  sessionStorage.setItem("miqat.qaylula-save.v1", JSON.stringify({ offsetMinutes: -1 }));
  render(<QaylulaCard schedule={schedule} />);
  await screen.findByText("Your saved draft is invalid. Please configure Qaylula again.");
  expect(fetch).not.toHaveBeenCalled();
});
