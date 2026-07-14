import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";
/* eslint-disable react-refresh/only-export-components */
import { render } from "@react-email/render";
import { domainConfig } from "../../../domain.config.js";
import { env } from "../../env.js";
import { sendEmail } from "../index.js";

type SubscriptionEmailOptions = {
  email: string;
  subscriptionId: string;
};

const emailBodyStyle = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Segoe UI",sans-serif',
};

const textStyle = { fontSize: "16px", lineHeight: "26px" };
const footerStyle = { color: "#64748b", fontSize: "12px" };

export function SubscriptionSuccessEmail({ email }: SubscriptionEmailOptions) {
  return (
    <Html>
      <Head />
      <Preview>구독 처리가 완료되었습니다</Preview>
      <Body style={emailBodyStyle}>
        <Container style={{ margin: "0 auto", padding: "20px 0 48px" }}>
          <Text style={{ ...textStyle, fontWeight: 700 }}>
            {domainConfig.storeName}
          </Text>
          <Text style={textStyle}>안녕하세요, {email}님.</Text>
          <Text style={textStyle}>
            구독 처리가 완료되었습니다. 이제 예약 운영에 필요한 유료 기능을
            사용할 수 있습니다.
          </Text>
          <Text style={textStyle}>
            <Link href={env.SITE_URL}>{domainConfig.storeName}</Link> 팀 드림
          </Text>
          <Hr style={{ borderColor: "#e2e8f0", margin: "20px 0" }} />
          <Text style={footerStyle}>Powered by Jeomwon</Text>
        </Container>
      </Body>
    </Html>
  );
}

export function SubscriptionErrorEmail({ email }: SubscriptionEmailOptions) {
  return (
    <Html>
      <Head />
      <Preview>구독 처리 확인이 필요합니다</Preview>
      <Body style={emailBodyStyle}>
        <Container style={{ margin: "0 auto", padding: "20px 0 48px" }}>
          <Text style={{ ...textStyle, fontWeight: 700 }}>
            {domainConfig.storeName}
          </Text>
          <Text style={textStyle}>안녕하세요, {email}님.</Text>
          <Text style={textStyle}>
            구독 처리를 완료하지 못했습니다. 결제는 청구되지 않았으며, 잠시 후
            다시 시도해 주세요.
          </Text>
          <Text style={textStyle}>
            <Link href={env.SITE_URL}>{domainConfig.storeName}</Link> 팀 드림
          </Text>
          <Hr style={{ borderColor: "#e2e8f0", margin: "20px 0" }} />
          <Text style={footerStyle}>Powered by Jeomwon</Text>
        </Container>
      </Body>
    </Html>
  );
}

export function renderSubscriptionSuccessEmail(args: SubscriptionEmailOptions) {
  return render(<SubscriptionSuccessEmail {...args} />);
}

export function renderSubscriptionErrorEmail(args: SubscriptionEmailOptions) {
  return render(<SubscriptionErrorEmail {...args} />);
}

export async function sendSubscriptionSuccessEmail({
  email,
  subscriptionId,
}: SubscriptionEmailOptions) {
  const html = await renderSubscriptionSuccessEmail({ email, subscriptionId });

  await sendEmail({
    to: email,
    subject: "구독 처리가 완료되었습니다",
    html,
  });
}

export async function sendSubscriptionErrorEmail({
  email,
  subscriptionId,
}: SubscriptionEmailOptions) {
  const html = await renderSubscriptionErrorEmail({ email, subscriptionId });

  await sendEmail({
    to: email,
    subject: "구독 처리 확인이 필요합니다",
    html,
  });
}
