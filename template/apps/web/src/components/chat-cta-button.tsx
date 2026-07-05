"use client";

import { Button } from "@jeomwon/ui/button";
import type { ComponentProps, ReactNode } from "react";

type ChatCtaButtonProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  children: ReactNode;
};

export function ChatCtaButton({
  children,
  type = "button",
  ...props
}: ChatCtaButtonProps) {
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
