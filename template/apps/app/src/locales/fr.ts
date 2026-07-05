export default {
  dashboard: {
    title: "Opérations de réservation",
    description:
      "Surveillez les réservations, les escalades et l'activité des agents en temps réel.",
    bodyTitle: "Opérations",
    bodyDescription: "Données opérationnelles Jeomwon.",
    bodyTip: "Mises à jour avec les données de réservation en temps réel.",
    headerTitle: "Tableau de bord",
    headerDescription: "Gérez les réservations et les opérations client.",
    documentationLink: "Explorer la documentation",
    statsHeld: "En attente",
    statsConfirmed: "Confirmées",
    statsEscalated: "Escaladées",
    statsExpired: "Expirées",
    reservationsTitle: "Réservations",
    reservationsDescription:
      "Consultez les réservations par heure, statut, ressource assignée et dernière mise à jour.",
    reservationsEmpty: "Aucune réservation à afficher pour le moment.",
    unknownCustomer: "Nom client manquant",
    assignedResource: "Ressource assignée",
    updatedAt: "Mis à jour",
    holdExpiresAt: "Expiration de la retenue",
    calendarTitle: "Calendrier des réservations",
    resourceColumn: "Ressource",
    closedDay: "La date sélectionnée est hors horaires d'ouverture.",
    seatGridTitle: "Grille de sièges",
    seatGridDescription:
      "Primitive opérateur pour les domaines à ressources spatiales.",
    seatAvailable: "Disponible",
    escalationTitle: "File d'escalade",
    escalationDescription:
      "Demandes d'annulation nécessitant une décision opérateur.",
    escalationEmpty: "Aucune escalade en attente.",
    waitingCount: "{count} en attente",
    internalMemo: "Mémo opérateur",
    riskSignals: "Signaux de risque",
    noMemo: "Aucun mémo opérateur enregistré.",
    noRiskSignals: "Aucun signal de risque",
    auditHistory: "Historique d'audit",
    auditHistoryEmpty: "Aucun historique d'audit pour le moment.",
    approveCancel: "Approuver l'annulation",
    keepReservation: "Maintenir la réservation",
    actionWorking: "Traitement",
    actionFailed: "La demande n'a pas pu être traitée.",
    timelineTitle: "Activité des agents",
    timelineDescription:
      "Conversations de réservation et événements automatiques récents.",
    timelineEmpty: "Aucun événement agent enregistré.",
    realtimeLabel: "Synchronisation temps réel",
    status: {
      draft: "Brouillon",
      eligible: "Disponible",
      held: "Retenue",
      confirmed: "Confirmée",
      rescheduled: "Replanifiée",
      waitlisted: "En attente",
      cancelled: "Annulée",
      expired: "Expirée",
      denied: "Refusée",
      escalated: "Revue opérateur",
    },
    agent: {
      triage: "Triage",
      availability: "Disponibilité",
      reservation: "Réservation",
      policy: "Politique",
      escalation: "Revue opérateur",
    },
  },
  login: {
    title: "Connexion admin Jeomwon",
    description:
      "Le tableau de bord opérateur est disponible uniquement après connexion.",
    cardTitle: "Connexion opérateur",
    cardDescription:
      "Utilisez votre compte Google pour accéder au tableau de bord des réservations.",
    privacy:
      "Les informations de connexion servent uniquement à l'authentification opérateur et à l'accès aux réservations.",
    google: "Se connecter avec Google",
    devAnonymous: "Connexion anonyme de développement",
    devOnly:
      "Affiché uniquement sur les déploiements dev activés avec AUTH_DEV_ANONYMOUS=1.",
    actionWorking: "Connexion",
    signInError:
      "La connexion a échoué. Vérifiez la configuration puis réessayez.",
  },
  navigation: {
    dashboard: "Tableau de bord",
    settings: "Paramètres",
    billing: "Facturation",
    documentation: "Docs",
    account: "Compte opérateur",
    free: "Gratuit",
    upgradePro: "Passer à PRO",
    theme: "Thème",
    themeOptions: {
      light: "Clair",
      dark: "Sombre",
      system: "Système",
    },
    language: "Langue",
    logout: "Déconnexion",
  },
  onboarding: {
    eyebrow: "Configuration initiale",
    title: "Définissez votre nom d'opérateur",
    description:
      "Ce nom apparaît dans l'interface opérateur et l'historique d'audit. Vous pourrez le modifier dans les paramètres.",
    usernameLabel: "Nom d'utilisateur",
    usernamePlaceholder: "ex. jeomwon-owner",
    continueButton: "Commencer",
    settingsHint:
      "Vous pouvez mettre à jour votre nom d'utilisateur à tout moment dans les paramètres.",
  },
  settings: {
    title: "Paramètres",
    headerTitle: "Paramètres",
    headerDescription: "Gérez vos paramètres de compte.",
    avatar: {
      title: "Votre Avatar",
      description: "Ceci est votre avatar. Il sera affiché sur votre profil.",
      uploadHint:
        "Cliquez sur l'avatar pour en télécharger un personnalisé depuis vos fichiers.",
      resetButton: "Réinitialiser",
    },
    username: {
      title: "Nom d'utilisateur",
      description:
        "Ce nom apparaît sur votre profil opérateur et dans les enregistrements internes.",
      placeholder: "Nom d'utilisateur",
      maxLengthHint: "Utilisez 32 caractères au maximum.",
      saveButton: "Enregistrer",
    },
    deleteAccount: {
      title: "Supprimer le Compte",
      description:
        "Supprimez définitivement votre compte opérateur Jeomwon et ses données de réservation associées.",
      warning: "Cette action ne peut pas être annulée, procédez avec prudence.",
      deleteButton: "Supprimer le Compte",
      confirmButton: "Êtes-vous sûr ?",
    },
    sidebar: {
      general: "Général",
      billing: "Facturation",
    },
    billing: {
      demoTitle: "Environnement de facturation test",
      demoDescription:
        "La facturation Jeomwon est configurée pour l'environnement de test Polar dans ce modèle. Les numéros de carte de test sont dans",
      testCardsLink: "la documentation de cartes Stripe",
      planTitle: "Plan",
      currentPlanPrefix: "Vous utilisez actuellement le plan",
      currentPlanSuffix: ".",
      free: "Gratuit",
      freeDescription:
        "Les fonctions opérationnelles principales sont disponibles gratuitement.",
      monthly: "Mensuel",
      yearly: "Annuel",
      expires: "Expire",
      renews: "Renouvelle",
      onDate: "le :",
      testChargeNotice:
        "Aucun montant ne sera facturé pour tester la mise à niveau.",
      upgradeButton: "Passer à PRO",
      manageTitle: "Gérer l'abonnement",
      manageDescription:
        "Modifiez le moyen de paiement, l'adresse de facturation et le statut de l'abonnement.",
      portalNotice: "Vous serez redirigé vers le portail client Polar.",
      manageButton: "Gérer",
    },
  },
} as const;
