import { TodayPage } from "@/components/app/TodayPage";
import { readAppUser } from "@/lib/auth/session.server";
import { redirect } from "next/navigation";
export default async function Page() {
  if (!(await readAppUser())) redirect("/app/account?next=/app");
  return <TodayPage />;
}
