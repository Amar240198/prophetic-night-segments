import { RoutinesCard } from "@/components/RoutinesCard";
import { PageHeader } from "@/components/app/ui";
import { readAppUser } from "@/lib/auth/session.server";
import { redirect } from "next/navigation";
export default async function Page() {
  if (!(await readAppUser())) redirect("/app/account?next=/app/routines");
  return (
    <>
      <PageHeader title="Routines" />
      <RoutinesCard />
    </>
  );
}
