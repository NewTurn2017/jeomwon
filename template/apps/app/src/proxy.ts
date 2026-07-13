import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { domainConfig } from "@jeomwon/backend/domain.config";
import { createI18nMiddleware } from "next-international/middleware";

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
    console.log("redirecting to /", {
      isSignIn,
      isAuthenticated,
    });
    return nextjsMiddlewareRedirect(request, "/");
  }
  if (!isSignIn && !isAuthenticated) {
    console.log("redirecting to /login", {
      isSignIn,
      isAuthenticated,
    });
    return nextjsMiddlewareRedirect(request, "/login");
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

    // all routes except static assets
    "/((?!.*\\..*|_next).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};
