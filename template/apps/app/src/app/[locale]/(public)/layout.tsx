import { DemoBanner } from "@/components/demo-banner";
import { env } from "@/env.mjs";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DemoBanner enabled={env.NEXT_PUBLIC_JEOMWON_DEMO === "1"} />
      {children}
    </>
  );
}
