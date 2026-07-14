"use client";

import { api } from "@pension-stay/backend/convex/_generated/api";
import * as validators from "@pension-stay/backend/convex/utils/validators";
import { Button } from "@pension-stay/ui/button";
import { Input } from "@pension-stay/ui/input";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useScopedI18n } from "@/locales/client";

export default function OnboardingUsername() {
  const t = useScopedI18n("onboarding");
  const user = useQuery(api.users.getUser);
  const updateUsername = useMutation(api.users.updateUsername);
  const router = useRouter();

  const { pending } = useFormStatus();

  const form = useForm({
    defaultValues: {
      username: "",
    },
    onSubmit: async ({ value }) => {
      await updateUsername({
        username: value.username,
      });
    },
  });

  useEffect(() => {
    if (!user) {
      return;
    }
    if (user?.username) {
      router.push("/");
    }
  }, [router, user]);

  if (!user) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-16">
      <section className="w-full rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-muted-foreground text-sm">{t("eyebrow")}</p>
          <h1 className="mt-2 font-semibold text-2xl text-card-foreground">
            {t("title")}
          </h1>
          <p className="mt-3 text-muted-foreground text-sm leading-6">
            {t("description")}
          </p>
        </div>
        <form
          className="flex w-full flex-col items-start gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <div className="flex w-full flex-col gap-2">
            <label
              htmlFor="username"
              className="font-medium text-foreground text-sm"
            >
              {t("usernameLabel")}
            </label>
            <form.Field
              name="username"
              validators={{
                onSubmit: validateUsername,
              }}
              // biome-ignore lint/correctness/noChildrenProp: tanstack best practice
              children={(field) => (
                <Input
                  id="username"
                  placeholder={t("usernamePlaceholder")}
                  autoComplete="off"
                  required
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={
                    field.state.meta?.errors.length > 0 || undefined
                  }
                  aria-describedby={
                    field.state.meta?.errors.length > 0
                      ? "onboarding-username-error"
                      : undefined
                  }
                  className={`bg-transparent ${
                    field.state.meta?.errors.length > 0 &&
                    "border-destructive focus-visible:ring-destructive"
                  }`}
                />
              )}
            />
          </div>

          <div className="flex flex-col">
            {form.state.fieldMeta.username?.errors.length > 0 && (
              <span
                id="onboarding-username-error"
                role="alert"
                className="mb-2 text-sm text-destructive dark:text-destructive-foreground"
              >
                {form.state.fieldMeta.username?.errors.join(" ")}
              </span>
            )}
          </div>

          <Button type="submit" size="sm" className="w-full">
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              t("continueButton")
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-muted-foreground text-sm leading-6">
          {t("settingsHint")}
        </p>
      </section>
    </main>
  );
}

function validateUsername({ value }: { value: string }) {
  const result = validators.username.safeParse(value);
  if (result.success) {
    return undefined;
  }
  return result.error.issues.map((issue) => issue.message).join(" ");
}
