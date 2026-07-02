import { ReservationCancelledEmail } from "../src/reservation.js";
import { sampleReservationEmailContext } from "../src/reservation-sample.js";

export default function ReservationCancelledPreview() {
  return <ReservationCancelledEmail context={sampleReservationEmailContext} />;
}
