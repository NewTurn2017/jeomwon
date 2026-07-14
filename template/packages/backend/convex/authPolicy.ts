export type AnonymousLoginProviderPolicyInput = {
  readonly customerAccounts: boolean;
  readonly anonymousLoginEnv: string | undefined;
  readonly adminEmailAllowlist: readonly string[];
};

export function anonymousLoginProviderPolicy({
  customerAccounts,
  anonymousLoginEnv,
  adminEmailAllowlist,
}: AnonymousLoginProviderPolicyInput) {
  return (
    customerAccounts === true &&
    anonymousLoginEnv === "1" &&
    adminEmailAllowlist.length > 0
  );
}

export function productAnonymousProfile() {
  return {
    isAnonymous: true as const,
    name: "Guest",
    username: "guest",
  };
}
