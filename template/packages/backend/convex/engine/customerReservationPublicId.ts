import type { Doc } from "../_generated/dataModel";

// Customer thread reads take one extra row as a truncation sentinel. Callers
// fail closed instead of returning or acting on an incomplete lifetime set.
export const customerReservationThreadReadCap = 256;
export const legacyPublicReservationLookupCap = 256;

type PublicReservationIdSource = Pick<
  Doc<"reservations">,
  "_id" | "reservationNumber"
>;

export function publicReservationId(
  reservation: PublicReservationIdSource,
): string {
  return (
    reservation.reservationNumber ?? legacyPublicReservationId(reservation)
  );
}

export function isLegacyPublicReservationId(value: string): boolean {
  return /^LEGACY-[A-F0-9]{32}$/.test(value.trim().toUpperCase());
}

function legacyPublicReservationId(
  reservation: Pick<Doc<"reservations">, "_id">,
): string {
  return `LEGACY-${opaqueLegacyIdDigest(reservation._id)}`;
}

// A wide deterministic digest keeps the legacy identifier stable without
// embedding any substring of the Convex document id. Four independently mixed
// 32-bit lanes produce the 128-bit uppercase-hex token accepted above.
function opaqueLegacyIdDigest(value: string): string {
  let h1 = 1_779_033_703;
  let h2 = 3_144_134_277;
  let h3 = 1_013_904_242;
  let h4 = 2_773_480_762;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597_399_067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2_869_860_233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951_274_213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2_716_044_179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597_399_067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2_869_860_233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951_274_213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2_716_044_179);

  return [h1, h2, h3, h4]
    .map((word) => (word >>> 0).toString(16).padStart(8, "0").toUpperCase())
    .join("");
}
