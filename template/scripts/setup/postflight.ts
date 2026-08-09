import fs from "node:fs";
import path from "node:path";
import {
  atomicWriteEnvFile,
  parseEnv,
  parseEnvKeys,
  readLocalEnv,
  upsertEnvText,
} from "./env-files";
import { localized, message } from "./locales";
import type { ConvexDeployment, RuntimeContext } from "./types";
import { glyph, RULE, section, style, tr, ui } from "./ui";

export async function finalizeEnvFiles(ctx: RuntimeContext) {
  section(localized(ctx.locale, "마무리", "Finish"));
  const missingByFile = new Map<string, string[]>();

  for (const project of ctx.config.projects) {
    if (
      project.type !== "envFile" ||
      !project.envFile ||
      !project.exampleFile
    ) {
      continue;
    }

    const envPath = path.join(ctx.root, project.envFile);
    const examplePath = path.join(ctx.root, project.exampleFile);
    const example = fs.existsSync(examplePath)
      ? fs.readFileSync(examplePath, "utf8")
      : "";
    const exampleKeys = parseEnvKeys(example);
    const existingText = fs.existsSync(envPath)
      ? fs.readFileSync(envPath, "utf8")
      : example;

    const updates = new Map<string, string>();
    for (const key of exampleKeys) {
      if (!parseEnv(existingText).has(key)) {
        updates.set(key, "");
      }
    }

    const pending = ctx.localEnvWrites.get(project.id);
    if (pending) {
      for (const [key, value] of pending) {
        updates.set(key, value);
      }
    }

    if (ctx.options.dryRun) {
      console.log(
        localized(
          ctx.locale,
          `DRY RUN: ${project.envFile}을 확인할 예정입니다.`,
          `DRY RUN: would ensure ${project.envFile}.`,
        ),
      );
    } else if (!fs.existsSync(envPath)) {
      atomicWriteEnvFile(envPath, upsertEnvText(example, updates));
      console.log(
        localized(
          ctx.locale,
          `${project.exampleFile}에서 ${project.envFile}을 생성했습니다.`,
          `${project.envFile} created from ${project.exampleFile}.`,
        ),
      );
    } else if (updates.size > 0) {
      atomicWriteEnvFile(envPath, upsertEnvText(existingText, updates));
      console.log(
        localized(
          ctx.locale,
          `${project.envFile}에 누락된 키를 추가했습니다.`,
          `${project.envFile} updated with missing keys.`,
        ),
      );
    } else {
      console.log(
        localized(
          ctx.locale,
          `${project.envFile}에 예제 키가 이미 있습니다.`,
          `${project.envFile} already has example keys.`,
        ),
      );
    }

    const finalValues = new Map([...parseEnv(existingText), ...updates]);
    for (const [key, value] of readLocalEnv(ctx, project.id)) {
      finalValues.set(key, value);
    }
    const missing = exampleKeys.filter((key) => !finalValues.has(key));
    if (missing.length > 0) {
      missingByFile.set(project.envFile, missing);
    }
  }

  if (missingByFile.size > 0) {
    console.log(
      localized(ctx.locale, "누락된 로컬 환경 키:", "Missing local env keys:"),
    );
    for (const [file, keys] of missingByFile) {
      console.log(`- ${file}: ${keys.join(", ")}`);
    }
  } else {
    console.log(
      localized(
        ctx.locale,
        ".env.example 파일에서 누락된 로컬 환경 키가 없습니다.",
        "No missing local env keys from .env.example files.",
      ),
    );
  }
}

export function printCompletion(
  ctx: RuntimeContext,
  deployment: ConvexDeployment,
) {
  console.log("");
  const completion = ctx.options.dryRun
    ? message(ctx.locale, "previewComplete")
    : message(ctx.locale, "complete");
  const completionCode = ctx.options.dryRun ? "preview_complete" : "complete";
  console.log(
    `  ${glyph.ok} [${completionCode}] ${style.green(style.bold(completion))}`,
  );
  console.log(`  ${RULE}`);
  ui.kv("Convex", deployment.convexUrl);
  printDeferredSummary(ctx);
  console.log(`  ${RULE}`);
  console.log(
    `  ${style.bold(tr("다음 단계", "Next steps"))} ${style.gray(
      tr("- 바로 써보기", "- start using the app"),
    )}`,
  );
  console.log(
    `  ${glyph.arrow} ${style.cyan("bun dev")}       ${style.gray(
      tr(
        "앱 실행 - 인증 고객 앱 :3000 / 정적 마케팅 웹 :3001",
        "Start the authenticated app on :3000 and static site on :3001",
      ),
    )}`,
  );
  console.log("");
  console.log(
    `  ${style.bold(tr("검증", "Verification"))} ${style.gray(
      tr("- 원할 때", "- when needed"),
    )}`,
  );
  console.log(
    `  ${glyph.arrow} ${style.cyan("bun run qa")}    ${style.gray(
      tr(
        "개발 배포 스모크 QA를 격리 실행하고 원래 상태로 복원",
        "Run isolated dev-deployment smoke QA and restore original state",
      ),
    )}`,
  );
  console.log(`  ${RULE}`);
  console.log(
    `  ${style.gray(
      tr(
        "Next 16 개발 접속에는 localhost를 사용하세요.",
        "Use localhost for Next 16 development access.",
      ),
    )}`,
  );
}

export function printDeferredSummary(ctx: RuntimeContext) {
  if (ctx.deferredKeys.size === 0) {
    ui.kv("Keys", style.green(tr("모두 설정됨", "all configured")));
    return;
  }

  ui.kv(
    "Later",
    tr(
      `${ctx.deferredKeys.size}개 키 미설정 ${style.gray("(값 숨김)")}`,
      `${ctx.deferredKeys.size} keys deferred ${style.gray("(values hidden)")}`,
    ),
  );
  for (const key of [...ctx.deferredKeys].sort()) {
    console.log(`    ${glyph.skip} ${style.gray(key)}`);
  }
  console.log(
    `    ${style.gray(tr("나중에 ", "Run "))}${style.cyan("bun setup")}${style.gray(
      tr(
        " 을 다시 실행하면 됩니다 - 이미 끝난 단계는 건너뜁니다.",
        " again later; completed steps are resumed safely.",
      ),
    )}`,
  );
}
