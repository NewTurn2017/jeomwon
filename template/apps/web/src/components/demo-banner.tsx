type DemoBannerProps = {
  readonly enabled: boolean;
};

export function DemoBanner({ enabled }: DemoBannerProps) {
  if (!enabled) {
    return null;
  }

  return (
    <div
      aria-label="데모 안내"
      aria-live="polite"
      className="border-border border-b bg-muted/60 px-4 py-2 text-center text-muted-foreground text-xs"
      role="status"
    >
      체험용 데모입니다 · 데이터는 매시간 초기화됩니다
    </div>
  );
}
