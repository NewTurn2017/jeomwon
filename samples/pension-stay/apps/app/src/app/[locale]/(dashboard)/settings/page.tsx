"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@pension-stay/backend/convex/_generated/api";
import type { Id } from "@pension-stay/backend/convex/_generated/dataModel";
import * as validators from "@pension-stay/backend/convex/utils/validators";
import { Button } from "@pension-stay/ui/button";
import { Input } from "@pension-stay/ui/input";
import type { ConvexUploadResponse } from "@pension-stay/ui/upload-input";
import { UploadInput } from "@pension-stay/ui/upload-input";
import { useDoubleCheck } from "@pension-stay/ui/utils";
import { useForm } from "@tanstack/react-form";
import { useAction, useMutation, useQuery } from "convex/react";
import { Upload } from "lucide-react";
import Image from "next/image";
import { useScopedI18n } from "@/locales/client";

export default function DashboardSettings() {
  const t = useScopedI18n("settings");
  const user = useQuery(api.users.getUser);
  const { signOut } = useAuthActions();
  const updateUserImage = useMutation(api.users.updateUserImage);
  const updateUsername = useMutation(api.users.updateUsername);
  const removeUserImage = useMutation(api.users.removeUserImage);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const deleteCurrentUserAccount = useAction(
    api.users.deleteCurrentUserAccount,
  );
  const { doubleCheck, getButtonProps } = useDoubleCheck();

  const handleUpdateUserImage = async (
    uploaded: ConvexUploadResponse<Id<"_storage">>[],
  ) => {
    const imageId = uploaded[0]?.storageId;
    if (!imageId) {
      return;
    }
    await updateUserImage({
      imageId,
    });
  };

  const handleDeleteAccount = async () => {
    await deleteCurrentUserAccount();
    signOut();
  };

  const usernameForm = useForm({
    defaultValues: {
      username: user?.username,
    },
    onSubmit: async ({ value }) => {
      await updateUsername({ username: value.username || "" });
    },
  });

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col gap-6">
      {/* Avatar */}
      <section className="flex w-full flex-col items-start rounded-lg border border-border bg-card">
        <div className="flex w-full items-start justify-between rounded-lg p-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-semibold text-card-foreground text-xl">
              {t("avatar.title")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t("avatar.description")}
            </p>
          </div>
          <UploadInput
            id="avatar_field"
            type="file"
            accept="image/*"
            className="peer sr-only"
            required
            generateUploadUrl={generateUploadUrl}
            onUploadComplete={handleUpdateUserImage}
          />
          <label
            htmlFor="avatar_field"
            className="group relative flex cursor-pointer overflow-hidden rounded-full transition active:scale-95 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card"
          >
            {user.avatarUrl ? (
              <Image
                unoptimized
                src={user.avatarUrl}
                className="h-20 w-20 rounded-full object-cover"
                alt={user.username ?? user.email ?? ""}
                width={80}
                height={80}
              />
            ) : (
              <div className="h-20 w-20 rounded-full border border-border bg-muted" />
            )}
            <div className="absolute z-10 hidden h-full w-full items-center justify-center bg-primary/40 group-hover:flex">
              <Upload className="h-6 w-6 text-primary-foreground" />
            </div>
          </label>
        </div>
        <div className="flex min-h-14 w-full items-center justify-between rounded-lg rounded-t-none border-border border-t bg-muted px-6">
          <p className="text-muted-foreground text-sm">
            {t("avatar.uploadHint")}
          </p>
          {user.avatarUrl && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                removeUserImage({});
              }}
            >
              {t("avatar.resetButton")}
            </Button>
          )}
        </div>
      </section>

      {/* Username */}
      <form
        className="flex w-full flex-col items-start rounded-lg border border-border bg-card"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          usernameForm.handleSubmit();
        }}
      >
        <div className="flex w-full flex-col gap-4 rounded-lg p-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-semibold text-card-foreground text-xl">
              {t("username.title")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t("username.description")}
            </p>
          </div>
          <usernameForm.Field
            name="username"
            validators={{
              onSubmit: validateUsername,
            }}
          >
            {(field) => (
              <Input
                placeholder={t("username.placeholder")}
                autoComplete="off"
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={field.state.meta?.errors.length > 0 || undefined}
                aria-describedby={
                  field.state.meta?.errors.length > 0
                    ? "settings-username-error"
                    : undefined
                }
                className={`w-80 bg-transparent ${
                  field.state.meta?.errors.length > 0 &&
                  "border-destructive focus-visible:ring-destructive"
                }`}
              />
            )}
          </usernameForm.Field>
          {usernameForm.state.fieldMeta.username?.errors.length > 0 && (
            <p
              id="settings-username-error"
              role="alert"
              className="text-sm text-destructive dark:text-destructive-foreground"
            >
              {usernameForm.state.fieldMeta.username?.errors.join(" ")}
            </p>
          )}
        </div>
        <div className="flex min-h-14 w-full items-center justify-between rounded-lg rounded-t-none border-border border-t bg-muted px-6">
          <p className="text-muted-foreground text-sm">
            {t("username.maxLengthHint")}
          </p>
          <Button type="submit" size="sm">
            {t("username.saveButton")}
          </Button>
        </div>
      </form>

      {/* Delete Account */}
      <section className="flex w-full flex-col items-start rounded-lg border border-destructive/40 bg-card">
        <div className="flex flex-col gap-2 p-6">
          <h2 className="font-semibold text-card-foreground text-xl">
            {t("deleteAccount.title")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("deleteAccount.description")}
          </p>
        </div>
        <div className="flex min-h-14 w-full items-center justify-between rounded-lg rounded-t-none border-border border-t bg-destructive/10 px-6">
          <p className="text-muted-foreground text-sm">
            {t("deleteAccount.warning")}
          </p>
          <Button
            size="sm"
            variant="destructive"
            {...getButtonProps({
              onClick: doubleCheck ? handleDeleteAccount : undefined,
            })}
          >
            {doubleCheck
              ? t("deleteAccount.confirmButton")
              : t("deleteAccount.deleteButton")}
          </Button>
          <span aria-live="assertive" className="sr-only">
            {doubleCheck ? t("deleteAccount.confirmPrompt") : ""}
          </span>
        </div>
      </section>
    </div>
  );
}

function validateUsername({ value }: { value: string | undefined }) {
  const result = validators.username.safeParse(value);
  if (result.success) {
    return undefined;
  }
  return result.error.issues.map((issue) => issue.message).join(" ");
}
