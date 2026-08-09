import { z } from "zod";
import { env } from "../env";

const ResendSuccessSchema = z.object({
  id: z.string(),
});
export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  idempotencyKey?: string;
};

export async function sendEmail(options: SendEmailOptions) {
  const from =
    env.RESEND_SENDER_EMAIL_AUTH ?? "Jeomwon <onboarding@resend.dev>";
  const { idempotencyKey, ...content } = options;
  const email = { from, ...content };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(email),
  });

  const data = await response.json();
  const parsedData = ResendSuccessSchema.safeParse(data);

  if (response.ok && parsedData.success) {
    return { status: "success", data: parsedData } as const;
  }
  throw new Error("email_provider_failed");
}
