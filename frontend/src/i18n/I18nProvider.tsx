import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { enMessages } from "./messages/en";
import { zhCnMessages } from "./messages/zh-CN";
import { jaMessages, type Messages } from "./messages/ja";

export type Locale = "ja" | "en" | "zh-CN";
export type TranslationVariables = Record<string, string | number>;

type MessageNode = string | { [key: string]: MessageNode };
type Dictionaries = Record<Locale, Messages>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, variables?: TranslationVariables) => string;
};

export const LOCALE_STORAGE_KEY = "layered-span-studio.locale";
export const dictionaries: Dictionaries = {
  ja: jaMessages,
  en: enMessages,
  "zh-CN": zhCnMessages,
};

function isLocale(value: string | null | undefined): value is Locale {
  return value === "ja" || value === "en" || value === "zh-CN";
}

function getMessage(messages: MessageNode, key: string): string | undefined {
  const result = key.split(".").reduce<MessageNode | undefined>((current, segment) => {
    if (!current || typeof current === "string") {
      return undefined;
    }
    return current[segment];
  }, messages);

  return typeof result === "string" ? result : undefined;
}

function interpolate(template: string, variables?: TranslationVariables) {
  if (!variables) {
    return template;
  }

  return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key: string) => {
    if (!(key in variables)) {
      return `{{${key}}}`;
    }
    return String(variables[key]);
  });
}

export function detectBrowserLocale(language: string | undefined) {
  const normalized = language?.toLowerCase();
  if (normalized?.startsWith("ja")) {
    return "ja";
  }
  if (
    normalized?.startsWith("zh-cn") ||
    normalized?.startsWith("zh-sg") ||
    normalized?.startsWith("zh-hans")
  ) {
    return "zh-CN";
  }
  return "en";
}

export function resolveInitialLocale(storedLocale: string | null | undefined, browserLanguage: string | undefined): Locale {
  if (isLocale(storedLocale)) {
    return storedLocale;
  }
  return detectBrowserLocale(browserLanguage);
}

export function translateMessage(
  locale: Locale,
  key: string,
  variables?: TranslationVariables,
  messageDictionaries: Dictionaries = dictionaries,
) {
  const template = getMessage(messageDictionaries[locale], key) ?? getMessage(messageDictionaries.ja, key) ?? key;
  return interpolate(template, variables);
}

const defaultContextValue: I18nContextValue = {
  locale: "ja",
  setLocale: () => {},
  t: (key, variables) => translateMessage("ja", key, variables),
};

const I18nContext = createContext<I18nContextValue>(defaultContextValue);

function readStoredLocale() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(LOCALE_STORAGE_KEY);
}

function writeStoredLocale(locale: Locale) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (initialLocale) {
      return initialLocale;
    }

    const browserLanguage = typeof window === "undefined" ? undefined : window.navigator.language;
    return resolveInitialLocale(readStoredLocale(), browserLanguage);
  });

  const setLocale = useCallback(
    (nextLocale: Locale) => {
      setLocaleState(nextLocale);
      if (!initialLocale) {
        writeStoredLocale(nextLocale);
      }
    },
    [initialLocale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, variables) => translateMessage(locale, key, variables),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
