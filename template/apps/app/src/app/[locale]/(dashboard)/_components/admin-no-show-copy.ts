import type { AdminNoShowCopy } from "./admin-no-show";

type NoShowKey =
  | "noShow.mark"
  | "noShow.title"
  | "noShow.irreversible"
  | "noShow.cancel"
  | "noShow.confirm"
  | "noShow.pending"
  | `noShow.errors.${keyof AdminNoShowCopy["errors"]}`;

export function adminNoShowCopy(
  t: (key: NoShowKey) => string,
): AdminNoShowCopy {
  return {
    mark: t("noShow.mark"),
    title: t("noShow.title"),
    irreversible: t("noShow.irreversible"),
    cancel: t("noShow.cancel"),
    confirm: t("noShow.confirm"),
    pending: t("noShow.pending"),
    errors: {
      no_show_disabled: t("noShow.errors.no_show_disabled"),
      no_show_future: t("noShow.errors.no_show_future"),
      no_show_wrong_status: t("noShow.errors.no_show_wrong_status"),
      no_show_already_marked: t("noShow.errors.no_show_already_marked"),
      reservation_not_found: t("noShow.errors.reservation_not_found"),
      auth_required: t("noShow.errors.auth_required"),
      admin_forbidden: t("noShow.errors.admin_forbidden"),
      unknown: t("noShow.errors.unknown"),
    },
  };
}
