import ArrowDropDownRoundedIcon from "@mui/icons-material/ArrowDropDownRounded";
import { Button, Menu, MenuItem, Tooltip, type SxProps, type Theme } from "@mui/material";
import { useState } from "react";
import { useI18n } from "../i18n/useI18n";
import type { Locale } from "../i18n/I18nProvider";

const localeFlags = {
  ja: "🇯🇵",
  en: "🇺🇸",
  "zh-CN": "🇨🇳",
} as const;

const localeKeys: Locale[] = ["ja", "en", "zh-CN"];

export function LanguageSwitcher({ sx }: { sx?: SxProps<Theme> }) {
  const { locale, setLocale, t } = useI18n();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <Tooltip title={t("shared.language.switcher")}>
        <Button
          color="inherit"
          aria-label={t("shared.language.switcher")}
          aria-controls={open ? "language-switcher-menu" : undefined}
          aria-expanded={open ? "true" : undefined}
          aria-haspopup="menu"
          onClick={(event) => setAnchorEl(event.currentTarget)}
          endIcon={<ArrowDropDownRoundedIcon />}
          sx={{
            minWidth: 0,
            px: 1.25,
            py: 0.75,
            borderRadius: 999,
            bgcolor: "#fff",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
            fontSize: 22,
            lineHeight: 1,
            "& .MuiButton-endIcon": {
              ml: 0.25,
            },
            ...sx,
          }}
        >
          <span aria-hidden="true">{localeFlags[locale]}</span>
        </Button>
      </Tooltip>
      <Menu
        id="language-switcher-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.75,
              borderRadius: 3,
            },
          },
        }}
      >
        {localeKeys.map((localeKey) => (
          <MenuItem
            key={localeKey}
            selected={locale === localeKey}
            aria-label={t(`shared.language.${localeKey}`)}
            onClick={() => {
              setLocale(localeKey);
              setAnchorEl(null);
            }}
            sx={{ minWidth: 160, gap: 1.25, fontSize: 16, lineHeight: 1.2 }}
          >
            <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>
              {localeFlags[localeKey]}
            </span>
            {t(`shared.language.${localeKey}`)}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
