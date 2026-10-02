import { requireAccountPage } from "@/lib/auth/require-account.server";
import { AccountPage } from "@/components/product/AccountPage";
export default async function Page() {
  await requireAccountPage("/app/account");
  return <AccountPage />;
}
