import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { api } from "@jeomwon/backend/convex/_generated/api";
import { domainConfig } from "@jeomwon/backend/domain.config";
import { fetchQuery } from "convex/nextjs";
import { createI18nMiddleware } from "next-international/middleware";
import { NextResponse } from "next/server";
import {
  adminLoginRedirectUrl,
  authenticatedLoginRedirectUrl,
  loadViewerRole,
} from "@/lib/admin-routing";

const domainLocale = (
  {
    "ko-KR": "ko",
    "en-US": "en",
  } as const
)[domainConfig.locale];

const I18nProxy = createI18nMiddleware({
  locales: ["ko", "en"],
  defaultLocale: domainLocale,
  resolveLocaleFromRequest: () => domainLocale,
  urlMappingStrategy: "rewrite",
});

const isSignInPage = createRouteMatcher(["/login"]);

const proxy = convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const isAuthenticated = await convexAuth.isAuthenticated();
  const isSignIn = isSignInPage(request);
  if (isSignIn && isAuthenticated) {
    const redirectUrl = authenticatedLoginRedirectUrl(request.nextUrl);
    console.log("redirecting authenticated login", {
      isSignIn,
      isAuthenticated,
      pathname: redirectUrl.pathname,
    });
    return NextResponse.redirect(redirectUrl);
  }
  if (!isSignIn && !isAuthenticated) {
    console.log("redirecting to /login", {
      isSignIn,
      isAuthenticated,
    });
    return request.nextUrl.pathname === "/admin"
      ? NextResponse.redirect(adminLoginRedirectUrl(request.nextUrl))
      : nextjsMiddlewareRedirect(request, "/login");
  }
  console.log("no redirect", {
    isSignIn,
    isAuthenticated,
  });

  // An authenticated non-operator must get a real HTTP 404 at /admin, not just
  // the visual not-found page. The route's page-level notFound() renders inside
  // the already-committed dashboard layout, so Next keeps the 200 status; only a
  // routing miss produces a true 404. Resolve the role here (same canonical
  // viewerRole query the page uses) and, for non-operators, rewrite to a path
  // with no route so Next serves not-found.tsx with a 404 status.
  if (request.nextUrl.pathname === "/admin") {
    const token = await convexAuth.getToken();
    const viewerRole = await loadViewerRole(() =>
      fetchQuery(api.admin.viewerRole, {}, { token }),
    );
    if (viewerRole !== "operator") {
      const notFoundUrl = request.nextUrl.clone();
      notFoundUrl.pathname = `/${domainLocale}/_admin-not-found`;
      return NextResponse.rewrite(notFoundUrl);
    }
  }

  if (request.cookies.get("Next-Locale")?.value !== domainLocale) {
    request.cookies.delete("Next-Locale");
  }

  return I18nProxy(request);
});

export default proxy;

export const config = {
  matcher: [
    "/((?!_next/static|api|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",

    // all routes except static assets and /api. /api is excluded so route
    // handlers (e.g. /api/chat) run their own auth and return real JSON status
    // codes instead of a 307 redirect to /login. The explicit "/(api|trpc)(.*)"
    // entry is intentionally dropped for the same reason.
    "/((?!.*\\..*|_next|api).*)",
    "/",

    // /api/auth is the one /api route the middleware MUST see: it is not a
    // route handler — convexAuthNextjsMiddleware itself serves the sign-in/
    // sign-out action proxy there. Without this entry every login POST 404s.
    "/api/auth",
  ],
};
