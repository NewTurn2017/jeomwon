import { domainConfig } from "@pension-stay/backend/domain.config";

export function Footer() {
  return (
    <footer className="border-border border-t bg-background">
      <div className="container flex flex-col gap-2 py-8 text-muted-foreground text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>{domainConfig.storeName}</p>
        <p>예약 문의는 채팅으로 남겨 주세요. Powered by jeomwon.</p>
      </div>
    </footer>
  );
}
