import {
  Body,
  Button,
  Container,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import { Logo } from "../components/logo.js";

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3001";

export default function WelcomeEmail() {
  return (
    <Html>
      <Preview>Jeomwon 예약 서비스 안내</Preview>
      <Tailwind>
        <Body className="my-auto mx-auto bg-white font-sans text-slate-900">
          <Container className="mx-auto my-[40px] max-w-[600px] border-transparent">
            <Logo />
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal">
              Jeomwon 예약 서비스에 오신 것을 환영합니다
            </Heading>
            <Section className="mb-4">
              <Text>
                Jeomwon은 도메인 설정을 바탕으로 고객 예약 페이지와 운영
                대시보드를 함께 제공하는 예약 SaaS 템플릿입니다.
              </Text>
            </Section>
            <Section className="mb-4">
              <Text>
                고객은 웹 채팅으로 가능 시간을 확인하고, 운영자는 관리자
                화면에서 예약 상태와 확인이 필요한 요청을 관리할 수 있습니다.
              </Text>
            </Section>
            <Section className="mb-8">
              <Text>
                상점명, 서비스, 영업 시간, 예약 정책은 domain.config에서
                조정하세요.
              </Text>
            </Section>
            <Section className="mb-6">
              <Link href={baseUrl}>
                <Button className="bg-slate-900 p-4 text-center text-white">
                  예약 페이지 열기
                </Button>
              </Link>
            </Section>
            <Hr />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
