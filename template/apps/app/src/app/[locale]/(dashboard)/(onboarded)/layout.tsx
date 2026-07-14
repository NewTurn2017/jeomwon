import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { api } from "@jeomwon/backend/convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { needsOnboarding } from "@/lib/anonymous-login";

export default async function OnboardedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await convexAuthNextjsToken();
  const user = await fetchQuery(api.users.getUser, {}, { token });

  if (needsOnboarding(user ?? undefined)) {
    redirect("/onboarding");
  }

  return children;
}
