import SvgIcon, { type SvgIconProps } from "@mui/material/SvgIcon";

const iconTones = {
  brand: {
    top: "#0b57d0",
    middle: "#1a73e8",
    bottom: "#188038",
    highlight: "#ffffff",
  },
  light: {
    top: "#b7d3ff",
    middle: "#d5e6ff",
    bottom: "#9ee6b5",
    highlight: "#ffffff",
  },
};

export function LayeredSpanIcon({ tone = "brand", ...props }: SvgIconProps & { tone?: keyof typeof iconTones }) {
  const colors = iconTones[tone];

  return (
    <SvgIcon viewBox="0 0 32 32" {...props}>
      <rect x="4" y="7" width="19" height="6" rx="3" fill={colors.top} />
      <rect x="8" y="13" width="21" height="6" rx="3" fill={colors.middle} />
      <rect x="4" y="19" width="19" height="6" rx="3" fill={colors.bottom} />
      <rect x="17" y="14.5" width="8" height="3" rx="1.5" fill={colors.highlight} opacity="0.96" />
    </SvgIcon>
  );
}
