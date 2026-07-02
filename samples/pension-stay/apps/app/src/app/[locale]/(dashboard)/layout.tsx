import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { api } from "@pension-stay/backend/convex/_generated/api";
import { domainConfig } from "@pension-stay/backend/domain.config";
import { fetchQuery, preloadQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
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
    <div className="flex min-h-[100vh] w-full flex-col bg-secondary dark:bg-black">
      <Navigation
        isPolarEnabled={domainConfig.features.polar}
        preloadedUser={preloadedUser}
        preloadedProducts={preloadedProducts}
      />
      {children}
    </div>
  );
}
