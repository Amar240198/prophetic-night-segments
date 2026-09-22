import { TodayPage } from "@/components/app/TodayPage";
import { readAppUser } from "@/lib/auth/session.server";
import { readSettings } from "@/lib/product/settings.server";
import { redirect } from "next/navigation";
export default async function Page() {
  const user = await readAppUser();
  if (!user) redirect("/sign-in");
  const settings = await readSettings(user.id);
  if (settings.onboarding !== "complete") redirect("/app/onboarding");
  return <TodayPage />;
}
