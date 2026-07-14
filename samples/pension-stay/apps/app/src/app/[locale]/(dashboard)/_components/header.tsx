import type { FC } from "react";

export const Header: FC<{ title: string; description: string }> = ({
  title,
  description,
}) => {
  return (
    <header className="w-full border-b border-border bg-card px-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-screen-xl flex-wrap items-baseline gap-x-3 gap-y-1 py-4">
        <h1 className="font-semibold text-card-foreground text-xl">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </header>
  );
};
