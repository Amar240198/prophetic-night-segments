import { requireAccountPage } from "@/lib/auth/require-account.server";
import { Onboarding } from "@/components/product/Onboarding";
export default async function Page() {
  await requireAccountPage("/app/onboarding");
  return <Onboarding />;
}
