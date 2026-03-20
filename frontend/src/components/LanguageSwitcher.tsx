import { ToggleButton, ToggleButtonGroup, type SxProps, type Theme } from "@mui/material";
import { useI18n } from "../i18n/useI18n";
import type { Locale } from "../i18n/I18nProvider";

export function LanguageSwitcher({ sx }: { sx?: SxProps<Theme> }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <ToggleButtonGroup
      value={locale}
      exclusive
      size="small"
      aria-label={t("shared.language.switcher")}
      onChange={(_event, nextLocale: Locale | null) => {
        if (nextLocale) {
          setLocale(nextLocale);
        }
      }}
      sx={{
        height: 36,
        bgcolor: "#fff",
        borderRadius: 999,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        "& .MuiToggleButton-root": {
          px: 1.5,
          border: "none",
          fontSize: 12,
          fontWeight: 700,
          textTransform: "none",
        },
        ...sx,
      }}
    >
      <ToggleButton value="ja" aria-label={t("shared.language.ja")}>
        {t("shared.language.ja")}
      </ToggleButton>
      <ToggleButton value="en" aria-label={t("shared.language.en")}>
        {t("shared.language.en")}
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
