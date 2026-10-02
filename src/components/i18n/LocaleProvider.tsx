"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { LOCALE_COOKIE, locales, parseLocale, translate, type Locale } from "@/lib/i18n/config";
const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({
  locale: "en",
  setLocale: () => {},
});
export function LocaleProvider({
  initialLocale = "en",
  children,
}: {
  initialLocale?: Locale;
  children: ReactNode;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locales[locale].dir;
  }, [locale]);
  function setLocale(value: Locale) {
    const next = parseLocale(value);
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    updateLocale(next);
  }
  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}
export function useI18n() {
  const context = useContext(LocaleContext);
  return {
    ...context,
    intl: locales[context.locale].intl,
    t: (text: string, values?: Record<string, string | number>) =>
      translate(context.locale, text, values),
  };
}
/** Explicit React text boundary: no DOM mutation, HTML injection or identifier translation. */
export function T({
  children,
  values,
}: {
  children: ReactNode;
  values?: Record<string, string | number>;
}) {
  const { t } = useI18n();
  function text(node: ReactNode): ReactNode {
    return typeof node === "string" ? t(node, values) : Array.isArray(node) ? node.map(text) : node;
  }
  return <>{text(children)}</>;
}
