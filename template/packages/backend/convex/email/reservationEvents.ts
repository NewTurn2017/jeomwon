// Reservation email events are written atomically with ledger completion in
// reservationEmailScheduler.completeReservationEmailDelivery. Keeping this
// module function-free prevents an internal caller from bypassing ledger dedupe.
export {};
