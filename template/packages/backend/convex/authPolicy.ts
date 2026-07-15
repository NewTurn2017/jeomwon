export type AnonymousLoginProviderPolicyInput = {
  readonly anonymousLoginEnv: string | undefined;
  readonly adminEmailAllowlist: readonly string[];
};

export function anonymousLoginProviderPolicy({
  anonymousLoginEnv,
  adminEmailAllowlist,
}: AnonymousLoginProviderPolicyInput) {
  return anonymousLoginEnv === "1" && adminEmailAllowlist.length > 0;
}

export function productAnonymousProfile() {
  return {
    isAnonymous: true as const,
    name: "Guest",
    username: "guest",
  };
}
