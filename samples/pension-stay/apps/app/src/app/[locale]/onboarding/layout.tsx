export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen w-full bg-muted/40">
      <div className="absolute top-8 left-1/2 mx-auto -translate-x-1/2 transform justify-center">
        <div className="rounded-md border border-border bg-card px-3 py-2 font-semibold text-foreground text-sm">
          Jeomwon
        </div>
      </div>
      <div className="z-10 min-h-screen w-full">{children}</div>
    </div>
  );
}
