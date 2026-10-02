import { requireAccountPage } from "@/lib/auth/require-account.server";
import { SettingsPage } from "@/components/product/SettingsPage";
export default async function Page({
  searchParams,
}: { searchParams?: Promise<{ intent?: string }> } = {}) {
  const intent = (await searchParams)?.intent;
  await requireAccountPage(
    intent === "sync" ? "/app/settings?intent=sync#calendar" : "/app/settings",
  );
  return <SettingsPage />;
}
