import { ReservationRescheduledEmail } from "../src/reservation.js";
import { sampleReservationEmailContext } from "../src/reservation-sample.js";

export default function ReservationRescheduledPreview() {
  return (
    <ReservationRescheduledEmail context={sampleReservationEmailContext} />
  );
}
