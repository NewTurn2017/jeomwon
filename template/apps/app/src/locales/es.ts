// spanish translations

export default {
  dashboard: {
    title: "Operaciones de reserva",
    description:
      "Supervisa reservas, escalaciones y actividad de agentes en tiempo real.",
    bodyTitle: "Operaciones",
    bodyDescription: "Datos operativos de Jeomwon.",
    bodyTip: "Actualiza mediante suscripciones reactivas de Convex.",
    headerTitle: "Panel de control",
    headerDescription: "Administra reservas y operaciones de clientes.",
    documentationLink: "Explorar documentación",
    statsHeld: "Retenidas",
    statsConfirmed: "Confirmadas",
    statsEscalated: "Escaladas",
    statsExpired: "Expiradas",
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
    internalMemo: "Memo operativo",
    riskSignals: "Señales de riesgo",
    auditHistory: "Historial de auditoría",
    approveCancel: "Aprobar cancelación",
    keepReservation: "Mantener reserva",
    actionWorking: "Procesando",
    timelineTitle: "Actividad de agentes",
    timelineEmpty: "Aún no hay eventos de agentes.",
    realtimeLabel: "Convex en tiempo real",
  },
  login: {
    title: "Inicio de sesión admin Jeomwon",
    description:
      "El panel operativo solo está disponible detrás de Convex Auth.",
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
    free: "Free",
    theme: "Tema",
    language: "Idioma",
    logout: "Cerrar sesión",
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
    deleteAccount: {
      title: "Eliminar Cuenta",
      description:
        "Elimina permanentemente tu cuenta de Convex SaaS, todos tus proyectos, enlaces y sus respectivas estadísticas.",
      warning: "Esta acción no se puede deshacer, procede con precaución.",
      deleteButton: "Eliminar Cuenta",
      confirmButton: "¿Estás seguro?",
    },
    sidebar: {
      general: "General",
      billing: "Facturación",
    },
  },
} as const;
