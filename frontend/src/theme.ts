import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1a73e8",
    },
    secondary: {
      main: "#0b57d0",
    },
    background: {
      default: "#f3f6fb",
      paper: "#ffffff",
    },
    success: {
      main: "#188038",
    },
    warning: {
      main: "#b06000",
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: '"Roboto", "Noto Sans JP", "Hiragino Sans", sans-serif',
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
    button: {
      textTransform: "none",
      fontWeight: 600,
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          border: "1px solid #d7e2f0",
          boxShadow: "0 1px 2px rgba(33, 68, 112, 0.08), 0 6px 18px rgba(33, 68, 112, 0.06)",
          backgroundImage: "none",
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 10,
          minWidth: 0,
          padding: "7px 14px",
          fontSize: 13,
          lineHeight: 1.3,
        },
        sizeSmall: {
          padding: "5px 10px",
          fontSize: 12,
        },
        sizeLarge: {
          padding: "9px 16px",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#fff",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          height: 26,
          fontSize: 12,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 44,
          padding: "8px 14px",
          fontSize: 14,
        },
      },
    },
  },
});
