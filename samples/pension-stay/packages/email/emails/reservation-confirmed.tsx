import { ReservationConfirmedEmail } from "../src/reservation.js";
import { sampleReservationEmailContext } from "../src/reservation-sample.js";

export default function ReservationConfirmedPreview() {
  return <ReservationConfirmedEmail context={sampleReservationEmailContext} />;
}
