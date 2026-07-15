type AnonymousLoginAvailabilityInput = {
  appEnv: string | undefined;
};

type OnboardingUser = {
  isAnonymous?: boolean;
  username?: string;
};

export function anonymousLoginAvailable({
  appEnv,
}: AnonymousLoginAvailabilityInput) {
  return appEnv === "1";
}

export function needsOnboarding(user: OnboardingUser | undefined) {
  return user?.isAnonymous !== true && !user?.username;
}
