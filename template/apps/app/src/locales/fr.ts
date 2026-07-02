export default {
  dashboard: {
    title: "Opérations de réservation",
    description:
      "Surveillez les réservations, les escalades et l'activité des agents en temps réel.",
    bodyTitle: "Opérations",
    bodyDescription: "Données opérationnelles Jeomwon.",
    bodyTip: "Mises à jour via les abonnements réactifs Convex.",
    headerTitle: "Tableau de bord",
    headerDescription: "Gérez les réservations et les opérations client.",
    documentationLink: "Explorer la documentation",
    statsHeld: "En attente",
    statsConfirmed: "Confirmées",
    statsEscalated: "Escaladées",
    statsExpired: "Expirées",
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
    internalMemo: "Mémo opérateur",
    riskSignals: "Signaux de risque",
    auditHistory: "Historique d'audit",
    approveCancel: "Approuver l'annulation",
    keepReservation: "Maintenir la réservation",
    actionWorking: "Traitement",
    timelineTitle: "Activité des agents",
    timelineEmpty: "Aucun événement agent enregistré.",
    realtimeLabel: "Convex temps réel",
  },
  login: {
    title: "Connexion admin Jeomwon",
    description:
      "Le tableau de bord opérateur est disponible uniquement derrière Convex Auth.",
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
    free: "Free",
    theme: "Thème",
    language: "Langue",
    logout: "Déconnexion",
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
    deleteAccount: {
      title: "Supprimer le Compte",
      description:
        "Supprimez définitivement votre compte Convex SaaS, tous vos projets, liens et leurs statistiques respectives.",
      warning: "Cette action ne peut pas être annulée, procédez avec prudence.",
      deleteButton: "Supprimer le Compte",
      confirmButton: "Êtes-vous sûr ?",
    },
    sidebar: {
      general: "Général",
      billing: "Facturation",
    },
  },
} as const;
