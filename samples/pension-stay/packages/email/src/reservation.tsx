import {
  Body,
  Container,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";

export const reservationEmailKinds = [
  "reservation.confirmed",
  "reservation.rescheduled",
  "reservation.cancelled",
  "reservation.escalated",
  "reservation.waitlist_opened",
] as const;

export type ReservationEmailKind = (typeof reservationEmailKinds)[number];

export type ReservationEmailContext = {
  readonly storeName: string;
  readonly displayName: string | null;
  readonly reservationId: string | null;
  readonly serviceLabel: string | null;
  readonly resourceLabel: string | null;
  readonly timeWindow: string | null;
  readonly policySummary: string;
  readonly nextStep: string;
  readonly copy: {
    readonly confirmed: string;
    readonly rescheduled: string;
    readonly cancelled: string;
    readonly cancelEscalated: string;
  };
};

export type ReservationEmailContent = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly summary: string;
};

type ReservationEmailProps = {
  readonly context: ReservationEmailContext;
};

type LayoutProps = ReservationEmailProps & {
  readonly title: string;
  readonly preview: string;
  readonly lead: string;
};

const detailLabelStyle = {
  color: "#64748b",
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0 0 2px",
} as const;

const detailValueStyle = {
  color: "#0f172a",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 14px",
} as const;

const containerStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  margin: "40px auto",
  maxWidth: "560px",
  padding: "28px",
} as const;

export function ReservationConfirmedEmail({ context }: ReservationEmailProps) {
  return (
    <ReservationEmailLayout
      context={context}
      title="예약 확정 안내"
      preview={`${context.storeName} 예약이 확정되었습니다.`}
      lead={context.copy.confirmed}
    />
  );
}

export function ReservationRescheduledEmail({
  context,
}: ReservationEmailProps) {
  return (
    <ReservationEmailLayout
      context={context}
      title="예약 변경 안내"
      preview={`${context.storeName} 예약이 변경되었습니다.`}
      lead={context.copy.rescheduled}
    />
  );
}

export function ReservationCancelledEmail({ context }: ReservationEmailProps) {
  return (
    <ReservationEmailLayout
      context={context}
      title="예약 취소 안내"
      preview={`${context.storeName} 예약이 취소되었습니다.`}
      lead={context.copy.cancelled}
    />
  );
}

export function ReservationEscalatedEmail({ context }: ReservationEmailProps) {
  return (
    <ReservationEmailLayout
      context={context}
      title="운영자 확인 접수 안내"
      preview={`${context.storeName} 운영자 확인 요청이 접수되었습니다.`}
      lead={context.copy.cancelEscalated}
    />
  );
}

export function ReservationWaitlistOpenedEmail({
  context,
}: ReservationEmailProps) {
  return (
    <ReservationEmailLayout
      context={context}
      title="대기 고객 예약 가능 안내"
      preview={`${context.storeName} 대기 고객에게 예약 가능 알림이 필요합니다.`}
      lead="대기 고객에게 예약 가능한 자리가 열렸습니다."
    />
  );
}

export async function renderReservationEmail(input: {
  readonly kind: ReservationEmailKind;
  readonly context: ReservationEmailContext;
}): Promise<ReservationEmailContent> {
  const element = emailElement(input.kind, input.context);
  const html = await render(element, { pretty: true });
  const text = await render(element, { plainText: true });

  return {
    subject: subjectForKind(input.kind, input.context.storeName),
    html,
    text,
    summary: summarizeText(text),
  };
}

function ReservationEmailLayout({
  context,
  title,
  preview,
  lead,
}: LayoutProps) {
  return (
    <Html lang="ko">
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: "#f8fafc",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          margin: 0,
        }}
      >
        <Container style={containerStyle}>
          <Text style={{ color: "#475569", fontSize: "14px", margin: 0 }}>
            {context.storeName}
          </Text>
          <Heading
            style={{
              color: "#0f172a",
              fontSize: "24px",
              lineHeight: "32px",
              margin: "10px 0 14px",
            }}
          >
            {title}
          </Heading>
          <Text
            style={{
              color: "#0f172a",
              fontSize: "16px",
              lineHeight: "26px",
              margin: "0 0 22px",
            }}
          >
            {lead}
          </Text>
          <Hr style={{ borderColor: "#e2e8f0", margin: "0 0 22px" }} />
          <Section>
            <Detail label="예약자" value={context.displayName ?? "익명 고객"} />
            <Detail label="서비스" value={context.serviceLabel ?? "-"} />
            <Detail label="담당/공간" value={context.resourceLabel ?? "-"} />
            <Detail label="예약 시간" value={context.timeWindow ?? "-"} />
            <Detail label="예약 번호" value={context.reservationId ?? "-"} />
          </Section>
          <Hr style={{ borderColor: "#e2e8f0", margin: "8px 0 20px" }} />
          <Text
            style={{
              color: "#334155",
              fontSize: "14px",
              lineHeight: "22px",
              margin: "0 0 10px",
            }}
          >
            {context.nextStep}
          </Text>
          <Text
            style={{
              color: "#64748b",
              fontSize: "13px",
              lineHeight: "20px",
              margin: 0,
            }}
          >
            {context.policySummary}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <>
      <Text style={detailLabelStyle}>{label}</Text>
      <Text style={detailValueStyle}>{value}</Text>
    </>
  );
}

function emailElement(
  kind: ReservationEmailKind,
  context: ReservationEmailContext,
) {
  switch (kind) {
    case "reservation.confirmed":
      return <ReservationConfirmedEmail context={context} />;
    case "reservation.rescheduled":
      return <ReservationRescheduledEmail context={context} />;
    case "reservation.cancelled":
      return <ReservationCancelledEmail context={context} />;
    case "reservation.escalated":
      return <ReservationEscalatedEmail context={context} />;
    case "reservation.waitlist_opened":
      return <ReservationWaitlistOpenedEmail context={context} />;
    default:
      return assertNever(kind);
  }
}

function subjectForKind(kind: ReservationEmailKind, storeName: string) {
  switch (kind) {
    case "reservation.confirmed":
      return `[${storeName}] 예약이 확정되었습니다`;
    case "reservation.rescheduled":
      return `[${storeName}] 예약이 변경되었습니다`;
    case "reservation.cancelled":
      return `[${storeName}] 예약이 취소되었습니다`;
    case "reservation.escalated":
      return `[${storeName}] 운영자 확인 요청이 접수되었습니다`;
    case "reservation.waitlist_opened":
      return `[${storeName}] 대기 고객에게 예약 가능 알림이 필요합니다`;
    default:
      return assertNever(kind);
  }
}

function summarizeText(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 220);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected reservation email kind: ${String(value)}`);
}
