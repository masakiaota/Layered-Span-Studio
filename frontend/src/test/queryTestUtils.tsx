import type { PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../query/queryClient";

export function createQueryWrapper() {
  const client = createQueryClient();

  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
