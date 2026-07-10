export default {
  metadata: {
    title: "Jeomwon · Reservation Operations",
    description:
      "AI reservation operations dashboard for live reservations, escalations, and agent activity in one authenticated operator surface.",
  },
  dashboard: {
    title: "Reservation Operations",
    description:
      "Monitor live reservations, escalations, and agent activity in one authenticated operator surface.",
    loading: "Loading",
    statsHeld: "Held",
    statsConfirmed: "Confirmed",
    statsEscalated: "Escalated",
    statsExpired: "Expired",
    reservationsTitle: "Reservations",
    reservationsDescription:
      "Review customer bookings by time, status, assigned resource, and latest update.",
    reservationsEmpty: "No reservations to show yet.",
    unknownCustomer: "Customer name missing",
    assignedResource: "Assigned resource",
    updatedAt: "Updated",
    holdExpiresAt: "Hold expires",
    escalationTitle: "Escalation Queue",
    escalationDescription:
      "Cancellation requests that require operator judgment.",
    escalationEmpty: "No escalations are waiting for review.",
    waitingCount: "{count} waiting",
    internalMemo: "Operator Memo",
    riskSignals: "Risk Signals",
    noMemo: "No operator memo has been recorded.",
    noRiskSignals: "No risk signals",
    auditHistory: "Audit History",
    auditHistoryEmpty: "No audit history yet.",
    approveCancel: "Approve cancel",
    keepReservation: "Keep reservation",
    actionWorking: "Working",
    actionFailed: "The request could not be completed.",
    timelineTitle: "Agent Activity",
    timelineDescription:
      "Recent reservation conversations and automation events.",
    timelineEmpty: "No agent events have been recorded yet.",
    realtimeLabel: "Realtime sync",
    status: {
      draft: "Draft",
      eligible: "Eligible",
      held: "Held",
      confirmed: "Confirmed",
      rescheduled: "Rescheduled",
      waitlisted: "Waitlisted",
      cancelled: "Cancelled",
      expired: "Expired",
      denied: "Denied",
      escalated: "Operator review",
    },
    agent: {
      triage: "Triage",
      availability: "Availability",
      reservation: "Reservation",
      policy: "Policy",
      escalation: "Operator review",
    },
  },
  login: {
    title: "Jeomwon Admin Login",
    description: "The operator dashboard is available only after sign-in.",
    cardTitle: "Operator sign-in",
    cardDescription:
      "Use your Google account to enter the reservation operations dashboard.",
    privacy:
      "Sign-in details are used only for operator authentication and reservation management access.",
    google: "Sign in with Google",
    devAnonymous: "Dev-only anonymous sign-in",
    devOnly:
      "Shown only on dev deployments explicitly opted in with AUTH_DEV_ANONYMOUS=1.",
    actionWorking: "Signing in",
    signInError: "Sign-in failed. Check the auth configuration and try again.",
  },
  navigation: {
    dashboard: "Dashboard",
    settings: "Settings",
    billing: "Billing",
    account: "Operator Account",
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
    title: "Set your operator name",
    description:
      "This name appears in the operations surface and audit history. You can change it later in settings.",
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
      description:
        "This name appears on your operator profile and internal records.",
      placeholder: "Username",
      maxLengthHint: "Use 32 characters at maximum.",
      saveButton: "Save",
    },
    deleteAccount: {
      title: "Delete Account",
      description:
        "Permanently delete your Jeomwon operator account and its related reservation data.",
      warning: "This action cannot be undone, proceed with caution.",
      deleteButton: "Delete Account",
      confirmButton: "Are you sure?",
      confirmPrompt:
        "Press the delete button again to permanently remove your account.",
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
