"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AccountSettings } from "@/lib/product/settings";
import type { getEntitlements } from "@/lib/product/entitlements.server";
import type { DailyPrayerSchedule } from "@/lib/calendar/buildCalendarEvents";
import type { NightCalculationResult } from "@prophetic-night/night-engine";
import type { SyncSource } from "@/lib/google-calendar/sync";
export interface ProductState {
  settings: AccountSettings;
  entitlements: Awaited<ReturnType<typeof getEntitlements>>;
  user: { id: string; email: string };
}
export interface ProductDay {
  date: string;
  timezone: string;
  source: SyncSource;
  schedule: DailyPrayerSchedule | null;
  night: NightCalculationResult;
  fasting: Array<{ date: string; kind: string }>;
}
export async function productApi<T>(url: string, body?: unknown, method = "PUT"): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      value.error?.message ?? "This request could not be completed. Please try again.",
    );
  return value;
}
const Context = createContext<{
  state: ProductState | null;
  day: ProductDay | null;
  error: string;
  dayError: string;
  refresh: () => Promise<void>;
  reloadDay: () => Promise<void>;
  save: (patch: Record<string, unknown>) => Promise<void>;
} | null>(null);
export function ProductProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProductState | null>(null),
    [day, setDay] = useState<ProductDay | null>(null),
    [error, setError] = useState(""),
    [dayError, setDayError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setState(await productApi<ProductState>("/api/account/preferences"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const reloadDay = useCallback(async () => {
    try {
      setDay(await productApi<ProductDay>("/api/account/day"));
      setDayError("");
    } catch (e) {
      setDay(null);
      setDayError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronise initial state from an external service or browser storage.
    void refresh();
  }, [refresh]);
  const sourceKey = state?.settings.configured ? JSON.stringify(state.settings.prayer) : undefined;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronise initial state from an external service or browser storage.
    if (sourceKey) void reloadDay();
  }, [sourceKey, reloadDay]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (sourceKey && document.visibilityState === "visible") void reloadDay();
    }, 300000);
    return () => clearInterval(timer);
  }, [reloadDay, sourceKey]);
  async function save(patch: Record<string, unknown>) {
    const next = await productApi<ProductState>("/api/account/preferences", {
      ...patch,
      revision: state?.settings.revision,
    });
    setState(next);
  }
  return (
    <Context.Provider value={{ state, day, error, dayError, refresh, reloadDay, save }}>
      {children}
    </Context.Provider>
  );
}
export function useProduct() {
  const value = useContext(Context);
  if (!value) throw new Error("ProductProvider required");
  return value;
}
