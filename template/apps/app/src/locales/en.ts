import dashboard from "./en-dashboard";

export default {
  metadata: {
    title: "Jeomwon · My Reservations",
    description:
      "Create and manage your reservations with help from the Jeomwon AI assistant.",
  },
  dashboard,
  admin: {
    title: "Reservation Operations",
    description:
      "Monitor live reservations, escalations, and agent activity in one authenticated operator surface.",
  },
  notFound: {
    title: "Page not found",
    description:
      "The page you requested does not exist or you do not have access to it.",
  },
  login: {
    title: "Sign in",
    description: "Sign in with Google or continue as a guest.",
    privacy:
      "Sign-in details are used only for account authentication and reservation access.",
    google: "Sign in with Google",
    alternative: "or",
    anonymous: "Continue as a guest",
    anonymousContinuityWarning:
      "If this browser loses its sign-in data, you cannot access your previous reservations again. Use Google sign-in for continued access.",
    anonymousConfigError:
      "Guest sign-in is not configured consistently between the app and authentication provider. Contact the operator.",
    actionWorking: "Signing in",
    signInError: "Sign-in failed. Check the auth configuration and try again.",
  },
  navigation: {
    reservations: "My Reservations",
    admin: "Admin",
    settings: "Settings",
    billing: "Billing",
    account: "My Account",
    free: "Free",
    upgradePro: "Upgrade to PRO",
    theme: "Theme",
    themeOptions: {
      light: "Light",
      dark: "Dark",
      system: "System",
    },
    language: "Language",
    logout: "Log Out",
  },
  onboarding: {
    eyebrow: "Initial setup",
    title: "Set your display name",
    description:
      "This name appears on your reservations and account. You can change it later in settings.",
    usernameLabel: "Username",
    usernamePlaceholder: "e.g. jeomwon-owner",
    continueButton: "Get started",
    settingsHint:
      "You can update your username at any time from account settings.",
  },
  settings: {
    avatar: {
      title: "Your Avatar",
      description: "This is your avatar. It will be displayed on your profile.",
      uploadHint: "Click on the avatar to upload a custom one from your files.",
      resetButton: "Reset",
    },
    username: {
      title: "Username",
      description: "This name appears on your reservations and account.",
      placeholder: "Username",
      maxLengthHint: "Use 32 characters at maximum.",
      saveButton: "Save",
    },
    deleteAccount: {
      title: "Delete Account",
      description:
        "Permanently delete your Jeomwon account and its related reservation data.",
      warning: "This action cannot be undone, proceed with caution.",
      deleteButton: "Delete Account",
      confirmButton: "Are you sure?",
      confirmPrompt:
        "Press the delete button again to permanently remove your account.",
      pending:
        "Account deletion is in progress. Keep this page open until it finishes.",
      pendingButton: "Deleting...",
      retryable:
        "Deletion paused safely. Your account remains active; retry to continue.",
      retryButton: "Retry deletion",
    },
    sidebar: {
      general: "General",
      billing: "Billing",
    },
    billing: {
      demoTitle: "Test billing environment",
      demoDescription:
        "In this template, Jeomwon billing runs against the Polar sandbox environment. Find test card numbers and payment steps in the",
      testCardsLink: "Polar sandbox docs",
      planTitle: "Plan",
      currentPlanPrefix: "You are currently on the",
      currentPlanSuffix: "plan.",
      free: "Free",
      freeDescription: "Core operations features are available for free.",
      monthly: "Monthly",
      yearly: "Yearly",
      expires: "Expires",
      renews: "Renews",
      onDate: "on:",
      testChargeNotice:
        "You will not be charged for testing the subscription upgrade.",
      upgradeButton: "Upgrade to PRO",
      manageTitle: "Manage Subscription",
      manageDescription:
        "Update your payment method, billing address, and subscription status.",
      portalNotice: "You will be redirected to the Polar Customer Portal.",
      manageButton: "Manage",
    },
  },
} as const;
