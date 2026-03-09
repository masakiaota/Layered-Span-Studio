import { useState } from "react";

export type ToastState = {
  open: boolean;
  message: string;
  severity: "success" | "info" | "warning" | "error";
};

export function useToast() {
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "",
    severity: "info",
  });

  return {
    toast,
    showToast(message: string, severity: ToastState["severity"] = "info") {
      setToast({ open: true, message, severity });
    },
    closeToast() {
      setToast((current) => ({ ...current, open: false }));
    },
  };
}
