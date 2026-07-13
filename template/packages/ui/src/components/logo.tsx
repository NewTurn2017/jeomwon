import { cn } from "../utils";

interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
  title?: string;
}

export function Logo({ width, height, className, title }: LogoProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("text-primary", className)}
      fill="none"
      height={height ?? 40}
      role={title ? "img" : undefined}
      viewBox="0 0 40 40"
      width={width ?? 40}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        height="34"
        rx="8"
        stroke="currentColor"
        strokeWidth="2"
        width="34"
        x="3"
        y="3"
      />
      <path
        d="M23 11V24.5C23 28 20.8 30 17.4 30C15.3 30 13.5 29.2 12.4 27.8L14.2 25.8C15 26.7 15.9 27.1 17.1 27.1C19 27.1 20 26.1 20 24.4V11H23Z"
        fill="currentColor"
      />
    </svg>
  );
}
