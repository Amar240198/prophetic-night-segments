import { GoogleCalendarCompletion } from "@/components/GoogleCalendarCompletion";

export default async function GoogleCalendarComplete({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <GoogleCalendarCompletion
      status={typeof params.status === "string" ? params.status : "CONNECTION_FAILED"}
    />
  );
}
