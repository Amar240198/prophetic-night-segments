import { requireAccountPage } from "@/lib/auth/require-account.server";
import { CalendarPage } from "@/components/app/CalendarPage";
export default async function Page() {
  await requireAccountPage("/app/calendar");
  return <CalendarPage />;
}
