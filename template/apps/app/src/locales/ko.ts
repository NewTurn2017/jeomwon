import dashboard from "./ko-dashboard";

export default {
  metadata: {
    title: "Jeomwon · 내 예약",
    description:
      "내 예약을 만들고 변경하며 AI 점원에게 필요한 도움을 받을 수 있습니다.",
  },
  dashboard,
  admin: {
    title: "예약 관제",
    description:
      "실시간 예약 상태, 에스컬레이션, 에이전트 활동을 한 화면에서 확인합니다.",
  },
  notFound: {
    title: "페이지를 찾을 수 없습니다",
    description: "요청하신 페이지가 없거나 접근 권한이 없습니다.",
  },
  login: {
    title: "로그인",
    description: "Google 계정으로 로그인하거나 비회원으로 시작하세요.",
    privacy: "로그인 정보는 계정 인증과 예약 접근 권한 확인에만 사용됩니다.",
    google: "Google로 로그인",
    alternative: "또는",
    anonymous: "비회원으로 시작",
    anonymousContinuityWarning:
      "이 브라우저의 로그인 정보가 사라지면 이전 예약에 다시 접근할 수 없습니다. 계속 이용하려면 Google 로그인을 사용하세요.",
    anonymousConfigError:
      "비회원 로그인이 앱과 인증 제공자에 동일하게 설정되지 않았습니다. 운영자에게 문의하세요.",
    actionWorking: "로그인 중",
    signInError: "로그인에 실패했습니다. 설정을 확인한 뒤 다시 시도하세요.",
  },
  navigation: {
    reservations: "내 예약",
    admin: "관리자",
    settings: "설정",
    billing: "결제",
    account: "내 계정",
    free: "무료",
    upgradePro: "PRO로 업그레이드",
    theme: "테마",
    themeOptions: {
      light: "라이트",
      dark: "다크",
      system: "시스템",
    },
    language: "언어",
    logout: "로그아웃",
  },
  onboarding: {
    eyebrow: "초기 설정",
    title: "사용할 이름을 설정하세요",
    description:
      "예약과 계정에 표시될 이름입니다. 설정에서 다시 바꿀 수 있습니다.",
    usernameLabel: "사용자명",
    usernamePlaceholder: "예: jeomwon-owner",
    continueButton: "시작하기",
    settingsHint: "사용자명은 계정 설정에서 언제든지 업데이트할 수 있습니다.",
  },
  settings: {
    avatar: {
      title: "아바타",
      description: "프로필에 표시되는 아바타입니다.",
      uploadHint: "아바타를 클릭해 파일에서 이미지를 업로드하세요.",
      resetButton: "초기화",
    },
    username: {
      title: "사용자명",
      description: "예약과 계정에 표시되는 이름입니다.",
      placeholder: "사용자명",
      maxLengthHint: "최대 32자까지 사용할 수 있습니다.",
      saveButton: "저장",
    },
    deleteAccount: {
      title: "계정 삭제",
      description: "내 계정과 관련 데이터를 영구 삭제합니다.",
      warning: "이 작업은 되돌릴 수 없습니다.",
      deleteButton: "계정 삭제",
      confirmButton: "정말 삭제할까요?",
      confirmPrompt: "삭제 버튼을 한 번 더 누르면 계정이 영구 삭제됩니다.",
      pending:
        "계정 삭제를 진행하고 있습니다. 완료될 때까지 이 페이지를 열어 두세요.",
      pendingButton: "삭제 중...",
      retryable:
        "삭제가 안전하게 일시 중지되었습니다. 계정은 유지되며 다시 시도할 수 있습니다.",
      retryButton: "삭제 다시 시도",
    },
    sidebar: {
      general: "일반",
      billing: "결제",
    },
    billing: {
      demoTitle: "테스트 결제 환경",
      demoDescription:
        "이 템플릿의 Jeomwon 결제는 Polar 샌드박스 환경으로 설정되어 있습니다. 테스트 카드 번호와 결제 방법은",
      testCardsLink: "Polar 샌드박스 문서에서 확인하세요",
      planTitle: "플랜",
      currentPlanPrefix: "현재",
      currentPlanSuffix: "플랜을 사용 중입니다.",
      free: "무료",
      freeDescription: "기본 운영 기능을 무료로 사용할 수 있습니다.",
      monthly: "월간",
      yearly: "연간",
      expires: "만료",
      renews: "갱신",
      onDate: "일자:",
      testChargeNotice:
        "구독 업그레이드 테스트에서는 실제 청구가 발생하지 않습니다.",
      upgradeButton: "PRO로 업그레이드",
      manageTitle: "구독 관리",
      manageDescription: "결제 수단, 청구 주소, 구독 상태를 관리합니다.",
      portalNotice: "Polar 고객 포털로 이동합니다.",
      manageButton: "관리",
    },
  },
} as const;
