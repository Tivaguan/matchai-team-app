"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let browserQueryClient: QueryClient | undefined;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // The counter iPad stays open all day, so refresh when it comes back into view.
      queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
    },
  });
}

function getQueryClient() {
  // Keep server renders isolated, and keep one cache for the whole browser tab.
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
