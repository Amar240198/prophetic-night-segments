import { requireAccountPage } from "@/lib/auth/require-account.server";
import { AutomationsPage } from "@/components/product/AutomationsPage";
export default async function Page() {
  await requireAccountPage("/app/automations");
  return <AutomationsPage />;
}
