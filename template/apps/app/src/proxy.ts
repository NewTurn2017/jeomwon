import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { domainConfig } from "@jeomwon/backend/domain.config";
import { createI18nMiddleware } from "next-international/middleware";
import { NextResponse } from "next/server";
import {
  adminLoginRedirectUrl,
  authenticatedLoginRedirectUrl,
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
