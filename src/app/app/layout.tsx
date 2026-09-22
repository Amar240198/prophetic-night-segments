import { AppShell } from "@/components/app/AppShell";
import { ProductProvider } from "@/components/product/ProductContext";
import { readAppUser } from "@/lib/auth/session.server";
import { getEntitlements } from "@/lib/product/entitlements.server";
import { redirect } from "next/navigation";
export default async function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const user = await readAppUser();
  if (!user) redirect("/sign-in");
  const entitlement = await getEntitlements(user.id);
  return (
    <AppShell plan={entitlement.plan}>
      <ProductProvider>{children}</ProductProvider>
    </AppShell>
  );
}
