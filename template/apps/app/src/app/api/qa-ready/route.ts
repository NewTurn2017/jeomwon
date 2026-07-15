import { env } from "../../../env.mjs";

const readyHeader = "x-jeomwon-qa-ready";

export function GET(request: Request): Response {
  const nonce = env.JEOMWON_QA_READY_NONCE;
  if (
    env.JEOMWON_QA_BROWSER !== "1" ||
    nonce === undefined ||
    request.headers.get(readyHeader) !== nonce
  ) {
    return new Response(null, { status: 404 });
  }
  return new Response("jeomwon-qa-ready", {
    status: 200,
    headers: { [readyHeader]: nonce },
  });
}
