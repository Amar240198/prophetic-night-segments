"use client";
import type { Routine } from "@/lib/routines/model";
import { ANCHOR_LABELS } from "@/lib/i18n/labels";
import { useI18n } from "./LocaleProvider";
export function RoutineRule({ routine }: { routine: Pick<Routine, "timing"> }) {
  const { t } = useI18n();
  const rule = routine.timing;
  if (rule.kind === "fixed") return <>{t("At {anchor}", { anchor: rule.time })}</>;
  const anchor = t(ANCHOR_LABELS[rule.anchor]);
  return (
    <>
      {t(
        rule.offsetMinutes === 0
          ? "At {anchor}"
          : rule.offsetMinutes < 0
            ? "{minutes} minutes before {anchor}"
            : "{minutes} minutes after {anchor}",
        { anchor, minutes: Math.abs(rule.offsetMinutes) },
      )}
    </>
  );
}
