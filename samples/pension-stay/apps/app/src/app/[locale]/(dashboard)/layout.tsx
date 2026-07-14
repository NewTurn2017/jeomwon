import "@/components/customer-chat-widget.css";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { api } from "@pension-stay/backend/convex/_generated/api";
import { domainConfig } from "@pension-stay/backend/domain.config";
import { fetchQuery, preloadQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { CustomerChatWidget } from "@/components/customer-chat-widget";
import { Navigation } from "./_components/navigation";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await convexAuthNextjsToken();
  const user = await fetchQuery(api.users.getUser, {}, { token });
  if (!user?.username) {
    return redirect("/onboarding");
  }
  const preloadedUser = await preloadQuery(api.users.getUser, {}, { token });
  const preloadedProducts = domainConfig.features.polar
    ? await preloadQuery(api.subscriptions.listAllProducts, {}, { token })
    : null;
  return (
    <div className="flex min-h-[100vh] w-full flex-col bg-muted/40">
      <Navigation
        isPolarEnabled={domainConfig.features.polar}
        preloadedUser={preloadedUser}
        preloadedProducts={preloadedProducts}
      />
      {children}
      {/*
       * Compile-time flag: with customerAccounts OFF the widget never mounts and
       * never calls /api/chat, so no customer-facing behavior changes. The route
       * file and @pension-stay/agents ARE compiled into apps/app either way (the kit
       * copies template/ wholesale), but the route 404s when the flag is off, so
       * the flag-off app has no functional chat surface.
       */}
      {domainConfig.features.customerAccounts ? <CustomerChatWidget /> : null}
    </div>
  );
}
