import { ReservationEscalatedEmail } from "../src/reservation.js";
import { sampleReservationEmailContext } from "../src/reservation-sample.js";

export default function ReservationEscalatedPreview() {
  return <ReservationEscalatedEmail context={sampleReservationEmailContext} />;
}
