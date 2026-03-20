import type { Locale } from "./i18n/I18nProvider";

const DEFAULT_IMPORT_YOUR_DATA_GUIDE_URL_JA =
  "https://github.com/masakiaota/Layered-Span-Studio/blob/main/docs/import-your-data.md";

const DEFAULT_IMPORT_YOUR_DATA_GUIDE_URL_EN =
  "https://github.com/masakiaota/Layered-Span-Studio/blob/main/docs/import-your-data-en.md";

const DEFAULT_IMPORT_YOUR_DATA_GUIDE_URL_ZH_CN =
  "https://github.com/masakiaota/Layered-Span-Studio/blob/main/docs/import-your-data-zh-CN.md";

export function getImportYourDataGuideUrl(locale: Locale) {
  if (locale === "en") {
    return import.meta.env.VITE_IMPORT_YOUR_DATA_GUIDE_URL_EN ?? DEFAULT_IMPORT_YOUR_DATA_GUIDE_URL_EN;
  }
  if (locale === "zh-CN") {
    return import.meta.env.VITE_IMPORT_YOUR_DATA_GUIDE_URL_ZH_CN ?? DEFAULT_IMPORT_YOUR_DATA_GUIDE_URL_ZH_CN;
  }

  return import.meta.env.VITE_IMPORT_YOUR_DATA_GUIDE_URL ?? DEFAULT_IMPORT_YOUR_DATA_GUIDE_URL_JA;
}
