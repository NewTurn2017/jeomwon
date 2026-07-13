"use client";

import { domainConfig } from "@jeomwon/backend/domain.config";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { CustomerChatWidget } from "@/components/customer-chat-widget";
import { env } from "@/env";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL, {
  verbose: true,
});

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProvider client={convex}>
      {children}
      {/*
       * With customerAccounts ON the chat is authenticated and lives in the app,
       * so this anonymous landing widget is not mounted — the CTA sends visitors
       * to the app login instead (see ChatCtaButton). With the flag OFF this
       * mounts exactly as before and the landing is byte-for-byte unchanged.
       */}
      {domainConfig.features.customerAccounts ? null : <CustomerChatWidget />}
    </ConvexProvider>
  );
}
