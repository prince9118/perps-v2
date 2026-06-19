"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import AuthInitializer from "@/components/AuthInitializer";


export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
       <AuthInitializer />

      {children}
    </QueryClientProvider>
  );
}
