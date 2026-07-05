// spanish translations

export default {
  dashboard: {
    title: "Operaciones de reserva",
    description:
      "Supervisa reservas, escalaciones y actividad de agentes en tiempo real.",
    bodyTitle: "Operaciones",
    bodyDescription: "Datos operativos de Jeomwon.",
    bodyTip: "Actualiza con datos de reservas en tiempo real.",
    headerTitle: "Panel de control",
    headerDescription: "Administra reservas y operaciones de clientes.",
    documentationLink: "Explorar documentación",
    statsHeld: "Retenidas",
    statsConfirmed: "Confirmadas",
    statsEscalated: "Escaladas",
    statsExpired: "Expiradas",
    reservationsTitle: "Reservas",
    reservationsDescription:
      "Revisa las reservas por hora, estado, recurso asignado y última actualización.",
    reservationsEmpty: "Aún no hay reservas para mostrar.",
    unknownCustomer: "Cliente sin nombre",
    assignedResource: "Recurso asignado",
    updatedAt: "Actualizado",
    holdExpiresAt: "La retención vence",
    calendarTitle: "Calendario de reservas",
    resourceColumn: "Recurso",
    closedDay: "La fecha seleccionada está fuera del horario.",
    seatGridTitle: "Cuadrícula de asientos",
    seatGridDescription:
      "Primitiva operativa para dominios con recursos espaciales.",
    seatAvailable: "Disponible",
    escalationTitle: "Cola de escalación",
    escalationDescription:
      "Solicitudes de cancelación que requieren criterio operativo.",
    escalationEmpty: "No hay escalaciones pendientes.",
    waitingCount: "{count} pendientes",
    internalMemo: "Memo operativo",
    riskSignals: "Señales de riesgo",
    noMemo: "No hay memo operativo registrado.",
    noRiskSignals: "Sin señales de riesgo",
    auditHistory: "Historial de auditoría",
    auditHistoryEmpty: "Aún no hay historial de auditoría.",
    approveCancel: "Aprobar cancelación",
    keepReservation: "Mantener reserva",
    actionWorking: "Procesando",
    actionFailed: "No se pudo completar la solicitud.",
    timelineTitle: "Actividad de agentes",
    timelineDescription:
      "Conversaciones de reserva y eventos automáticos recientes.",
    timelineEmpty: "Aún no hay eventos de agentes.",
    realtimeLabel: "Sincronización en tiempo real",
    status: {
      draft: "Borrador",
      eligible: "Disponible",
      held: "Retenida",
      confirmed: "Confirmada",
      rescheduled: "Reprogramada",
      waitlisted: "En espera",
      cancelled: "Cancelada",
      expired: "Expirada",
      denied: "Rechazada",
      escalated: "Revisión operativa",
    },
    agent: {
      triage: "Triaje",
      availability: "Disponibilidad",
      reservation: "Reserva",
      policy: "Política",
      escalation: "Revisión operativa",
    },
  },
  login: {
    title: "Inicio de sesión admin Jeomwon",
    description:
      "El panel operativo solo está disponible después de iniciar sesión.",
    cardTitle: "Inicio de operador",
    cardDescription:
      "Usa tu cuenta de Google para entrar al panel operativo de reservas.",
    privacy:
      "Los datos de inicio de sesión se usan solo para autenticación operativa y acceso a reservas.",
    google: "Iniciar sesión con Google",
    devAnonymous: "Inicio anónimo de desarrollo",
    devOnly:
      "Solo se muestra en despliegues dev habilitados con AUTH_DEV_ANONYMOUS=1.",
    actionWorking: "Iniciando sesión",
    signInError:
      "No se pudo iniciar sesión. Revisa la configuración e inténtalo de nuevo.",
  },
  navigation: {
    dashboard: "Panel",
    settings: "Configuración",
    billing: "Facturación",
    documentation: "Docs",
    account: "Cuenta operativa",
    free: "Gratis",
    upgradePro: "Mejorar a PRO",
    theme: "Tema",
    themeOptions: {
      light: "Claro",
      dark: "Oscuro",
      system: "Sistema",
    },
    language: "Idioma",
    logout: "Cerrar sesión",
  },
  onboarding: {
    eyebrow: "Configuración inicial",
    title: "Configura tu nombre de operador",
    description:
      "Este nombre aparece en la superficie operativa y el historial de auditoría. Puedes cambiarlo luego en configuración.",
    usernameLabel: "Nombre de usuario",
    usernamePlaceholder: "ej. jeomwon-owner",
    continueButton: "Empezar",
    settingsHint:
      "Puedes actualizar tu nombre de usuario en cualquier momento desde la configuración.",
  },
  settings: {
    title: "Configuración",
    headerTitle: "Configuración",
    headerDescription: "Administra tus configuraciones de cuenta.",
    avatar: {
      title: "Tu Avatar",
      description: "Este es tu avatar. Se mostrará en tu perfil.",
      uploadHint:
        "Haz clic en el avatar para subir uno personalizado desde tus archivos.",
      resetButton: "Restablecer",
    },
    username: {
      title: "Nombre de usuario",
      description:
        "Este nombre aparece en tu perfil operativo y registros internos.",
      placeholder: "Nombre de usuario",
      maxLengthHint: "Usa 32 caracteres como máximo.",
      saveButton: "Guardar",
    },
    deleteAccount: {
      title: "Eliminar Cuenta",
      description:
        "Elimina permanentemente tu cuenta operativa de Jeomwon y sus datos de reservas relacionados.",
      warning: "Esta acción no se puede deshacer, procede con precaución.",
      deleteButton: "Eliminar Cuenta",
      confirmButton: "¿Estás seguro?",
    },
    sidebar: {
      general: "General",
      billing: "Facturación",
    },
    billing: {
      demoTitle: "Entorno de facturación de prueba",
      demoDescription:
        "La facturación de Jeomwon está configurada para el entorno de prueba de Polar en esta plantilla. Los números de tarjeta de prueba están en",
      testCardsLink: "la documentación de tarjetas de Stripe",
      planTitle: "Plan",
      currentPlanPrefix: "Actualmente estás en el plan",
      currentPlanSuffix: ".",
      free: "Gratis",
      freeDescription:
        "Las funciones operativas principales están disponibles gratis.",
      monthly: "Mensual",
      yearly: "Anual",
      expires: "Vence",
      renews: "Renueva",
      onDate: "el:",
      testChargeNotice: "No se te cobrará por probar la mejora de suscripción.",
      upgradeButton: "Mejorar a PRO",
      manageTitle: "Gestionar suscripción",
      manageDescription:
        "Actualiza tu método de pago, dirección de facturación y estado de suscripción.",
      portalNotice: "Serás redirigido al portal de clientes de Polar.",
      manageButton: "Gestionar",
    },
  },
} as const;
