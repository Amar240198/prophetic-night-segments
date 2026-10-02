import { ar } from "./locales/ar";
export const LOCALE_COOKIE = "miqat_locale";
export const locales = {
  en: { label: "English", dir: "ltr", intl: "en-GB", messages: {} },
  ar: { label: "العربية", dir: "rtl", intl: "ar", messages: ar },
} as const;
export type Locale = keyof typeof locales;
export function parseLocale(value: unknown): Locale {
  return typeof value === "string" && Object.hasOwn(locales, value) ? (value as Locale) : "en";
}
/** UI messages only. Interpolated values are raw data, never recursively translated. */
export function translate(
  locale: Locale,
  text: string,
  values: Record<string, string | number> = {},
): string {
  const messages: Record<string, string> = locales[locale].messages;
  const key = text.trim().replace(/\s+/g, " ");
  const translated = Object.hasOwn(messages, key) ? messages[key] : undefined;
  const message = typeof translated === "string" ? text.replace(text.trim(), translated) : text;
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
