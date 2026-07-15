import { domainConfig } from "@jeomwon/backend/domain.config";
import { buttonVariants } from "@jeomwon/ui/button";
import { LogIn } from "lucide-react";
import Link from "next/link";
import { appLoginUrl } from "@/env";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-border border-b bg-background/95 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link className="min-w-0 font-semibold text-foreground" href="/">
          <span className="block truncate">{domainConfig.storeName}</span>
        </Link>
        <nav aria-label="주요 메뉴" className="flex items-center gap-4">
          <a
            className="hidden text-muted-foreground text-sm transition-colors hover:text-foreground sm:inline"
            href="#services"
          >
            서비스
          </a>
          <a
            className={buttonVariants({ className: "h-10 gap-2 px-4" })}
            href={appLoginUrl}
          >
            <LogIn aria-hidden="true" className="h-4 w-4" />
            예약 시작
          </a>
        </nav>
      </div>
    </header>
  );
}
