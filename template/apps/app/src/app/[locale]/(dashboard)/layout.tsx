import "@/components/customer-chat-widget.css";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { api } from "@jeomwon/backend/convex/_generated/api";
import { domainConfig } from "@jeomwon/backend/domain.config";
import { jeomwonConvex } from "@jeomwon/backend/src/convex-refs";
import { fetchQuery, preloadQuery } from "convex/nextjs";
import { CustomerChatWidget } from "@/components/customer-chat-widget";
import { DemoBanner } from "@/components/demo-banner";
import { env } from "@/env.mjs";
import { loadViewerRole } from "@/lib/admin-routing";
import { Navigation } from "./_components/navigation";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await convexAuthNextjsToken();
  const viewerRole = await loadViewerRole(() =>
    fetchQuery(jeomwonConvex.admin.viewerRole, {}, { token }),
  );
  const preloadedUser = await preloadQuery(api.users.getUser, {}, { token });
  const preloadedProducts = domainConfig.features.polar
    ? await preloadQuery(api.subscriptions.listAllProducts, {}, { token })
    : null;
  const QaBrowserBridge =
    env.JEOMWON_QA_BROWSER === "1" && process.env.NODE_ENV !== "production"
      ? (await import("@/components/qa-browser-bridge")).QaBrowserBridge
      : null;
  return (
    <div className="flex min-h-[100vh] w-full flex-col bg-muted/40">
      <Navigation
        isPolarEnabled={domainConfig.features.polar}
        preloadedUser={preloadedUser}
        preloadedProducts={preloadedProducts}
        viewerRole={viewerRole}
      />
      <DemoBanner enabled={env.NEXT_PUBLIC_JEOMWON_DEMO === "1"} />
      {children}
      <CustomerChatWidget />
      {QaBrowserBridge === null ? null : <QaBrowserBridge />}
    </div>
  );
}
