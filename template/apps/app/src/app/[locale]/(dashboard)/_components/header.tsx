import type { FC } from "react";

export const Header: FC<{ title: string; description: string }> = ({
  title,
  description,
}) => {
  return (
    <header className="z-10 w-full border-b border-border bg-card px-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-screen-xl items-center justify-between py-8">
        <div className="flex flex-col items-start gap-2">
          <h1 className="font-semibold text-3xl text-card-foreground">
            {title}
          </h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
    </header>
  );
};
