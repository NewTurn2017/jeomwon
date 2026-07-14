"use client";

import { domainConfig } from "@jeomwon/backend/domain.config";
import { Button } from "@jeomwon/ui/button";
import type { ComponentProps, ReactNode } from "react";
import { env } from "@/env";

type ChatCtaButtonProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  children: ReactNode;
};

export function ChatCtaButton({
  children,
  type = "button",
  ...props
}: ChatCtaButtonProps) {
  // With customerAccounts ON the anonymous landing widget is not mounted, so the
  // "open chat" affordance instead points visitors at the authenticated app
  // login. Gated on a configured NEXT_PUBLIC_APP_URL as well: with the flag OFF —
  // or the app URL unset — this renders exactly as today, dispatching the
  // open-chat event to the landing widget.
  const loginHref =
    domainConfig.features.customerAccounts && env.NEXT_PUBLIC_APP_URL
      ? `${env.NEXT_PUBLIC_APP_URL}/login`
      : null;

  if (loginHref) {
    return (
      <Button {...props} asChild>
        <a href={loginHref}>{children}</a>
      </Button>
    );
  }

  return (
    <Button
      {...props}
      type={type}
      onClick={() => {
        window.dispatchEvent(new CustomEvent("jeomwon:open-chat"));
      }}
    >
      {children}
    </Button>
  );
}
