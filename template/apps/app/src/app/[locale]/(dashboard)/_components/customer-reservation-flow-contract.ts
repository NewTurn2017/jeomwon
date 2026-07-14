import type {
  CustomerAvailableSlotsArgs,
  CustomerCreateHoldArgs,
  CustomerRescheduleArgs,
  CustomerReservation,
  CustomerReservationRef,
  DomainPublicSnapshot,
  PublicSlot,
} from "@jeomwon/backend/src/agent-contract";
import type { CustomerReservationErrorCode } from "./customer-reservation-errors";

export type CustomerReservationGateway = {
  readonly availableSlots: (
    args: CustomerAvailableSlotsArgs,
  ) => Promise<unknown>;
  readonly createHold: (args: CustomerCreateHoldArgs) => Promise<unknown>;
  readonly confirmReservation: (
    args: CustomerReservationRef,
  ) => Promise<unknown>;
  readonly rescheduleReservation: (
    args: CustomerRescheduleArgs,
  ) => Promise<unknown>;
  readonly cancelReservation: (
    args: CustomerReservationRef,
  ) => Promise<unknown>;
};

export type BookingDraft = {
  readonly kind: "create" | "edit";
  readonly reservationId: string | null;
  readonly serviceKey: string;
  readonly resourceKey: string | null;
  readonly preferredStartMs: number | null;
  readonly slots: readonly PublicSlot[];
  readonly selectedSlot: PublicSlot | null;
  readonly hold: {
    readonly reservationId: string;
    readonly expiresAtMs: number;
  } | null;
};

export type CustomerReservationFlowState = {
  readonly dialog:
    | { readonly kind: "closed" }
    | BookingDraft
    | { readonly kind: "cancel"; readonly reservationId: string };
  readonly pending: boolean;
  readonly error: CustomerReservationErrorCode | null;
  readonly notice: string | null;
};

export type CustomerReservationFlow = {
  readonly getState: () => CustomerReservationFlowState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly openCreate: (serviceKey: string, resourceKey: string | null) => void;
  readonly openEdit: (reservation: CustomerReservation) => void;
  readonly openCancel: (reservationId: string) => void;
  readonly close: () => void;
  readonly updateBooking: (
    serviceKey: string,
    resourceKey: string | null,
  ) => void;
  readonly selectSlot: (slot: PublicSlot) => void;
  readonly searchAvailability: (domain: DomainPublicSnapshot) => Promise<void>;
  readonly createHold: () => Promise<void>;
  readonly confirmHold: (nowMs: number) => Promise<void>;
  readonly confirmExisting: (
    reservationId: string,
    holdExpiresAtMs: number | null,
    nowMs: number,
  ) => Promise<void>;
  readonly reschedule: () => Promise<void>;
  readonly cancel: () => Promise<void>;
};
