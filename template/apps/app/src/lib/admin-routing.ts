export type ReturnTo = "/" | "/admin";
export type ViewerRole = "operator" | "customer";

export function normalizeReturnTo(input: unknown): ReturnTo {
  return input === "/admin" ? "/admin" : "/";
}

export function returnToFromUrl(url: URL): ReturnTo {
  const values = url.searchParams.getAll("returnTo");
  return normalizeReturnTo(values.length === 1 ? values[0] : undefined);
}

export function adminLoginRedirectUrl(requestUrl: URL): URL {
  const redirectUrl = new URL(requestUrl);
  redirectUrl.pathname = "/login";
  redirectUrl.search = "";
  redirectUrl.hash = "";
  redirectUrl.searchParams.set("returnTo", "/admin");
  return redirectUrl;
}

export function authenticatedLoginRedirectUrl(requestUrl: URL): URL {
  const redirectUrl = new URL(requestUrl);
  redirectUrl.pathname = returnToFromUrl(requestUrl);
  redirectUrl.search = "";
  redirectUrl.hash = "";
  return redirectUrl;
}

export async function loadViewerRole(
  queryRole: () => Promise<unknown>,
): Promise<ViewerRole> {
  try {
    return (await queryRole()) === "operator" ? "operator" : "customer";
  } catch {
    return "customer";
  }
}
