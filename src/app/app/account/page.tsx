import { Suspense } from "react";
import { AccountPage } from "@/components/app/AccountPage";
import { readAppUser } from "@/lib/auth/session.server";
export default async function Page() {
  const user = await readAppUser();
  return (
    <Suspense fallback={<p>Loading account…</p>}>
      <AccountPage user={user} />
    </Suspense>
  );
}
