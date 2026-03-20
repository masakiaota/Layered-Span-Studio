import ArrowDropDownRoundedIcon from "@mui/icons-material/ArrowDropDownRounded";
import { Button, Menu, MenuItem, Tooltip, type SxProps, type Theme } from "@mui/material";
import { useState } from "react";
import { useI18n } from "../i18n/useI18n";

const localeFlags = {
  ja: "🇯🇵",
  en: "🇺🇸",
} as const;

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
        <MenuItem
          selected={locale === "ja"}
          aria-label={t("shared.language.ja")}
          onClick={() => {
            setLocale("ja");
            setAnchorEl(null);
          }}
          sx={{ minWidth: 140, gap: 1.25, fontSize: 16, lineHeight: 1.2 }}
        >
          <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>
            {localeFlags.ja}
          </span>
          {t("shared.language.ja")}
        </MenuItem>
        <MenuItem
          selected={locale === "en"}
          aria-label={t("shared.language.en")}
          onClick={() => {
            setLocale("en");
            setAnchorEl(null);
          }}
          sx={{ minWidth: 140, gap: 1.25, fontSize: 16, lineHeight: 1.2 }}
        >
          <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>
            {localeFlags.en}
          </span>
          {t("shared.language.en")}
        </MenuItem>
      </Menu>
    </>
  );
}
