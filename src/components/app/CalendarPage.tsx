"use client";
import { PageHeader } from "./ui";
import { CalendarExperience } from "../product/CalendarExperience";
export function CalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" description="See Salah alongside your real schedule." />
      <CalendarExperience />
    </>
  );
}
