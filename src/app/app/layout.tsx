import { AppShell } from "@/components/app/AppShell";
import { ProductProvider } from "@/components/product/ProductContext";
import { readAppUser } from "@/lib/auth/session.server";
import { getEntitlements } from "@/lib/product/entitlements.server";
export default async function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const user = await readAppUser();
  const entitlement = user ? await getEntitlements(user.id) : { plan: "FREE" };
  return (
    <AppShell plan={entitlement.plan}>
      {user ? <ProductProvider>{children}</ProductProvider> : children}
    </AppShell>
  );
}
