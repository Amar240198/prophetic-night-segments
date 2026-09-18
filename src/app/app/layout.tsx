import { AppShell } from "@/components/app/AppShell";
import { PrayerWorkspace } from "@/components/app/PrayerWorkspace";
import { readAppUser } from "@/lib/auth/session.server";
export default async function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const user = await readAppUser();
  return (
    <AppShell plan={user?.plan}>
      <PrayerWorkspace autoLoad>{children}</PrayerWorkspace>
    </AppShell>
  );
}
