type AnonymousLoginAvailabilityInput = {
  customerAccounts: boolean;
  appEnv: string | undefined;
};

type OnboardingUser = {
  isAnonymous?: boolean;
  username?: string;
};

export function anonymousLoginAvailable({
  customerAccounts,
  appEnv,
}: AnonymousLoginAvailabilityInput) {
  return customerAccounts && appEnv === "1";
}

export function needsOnboarding(user: OnboardingUser | undefined) {
  return user?.isAnonymous !== true && !user?.username;
}
