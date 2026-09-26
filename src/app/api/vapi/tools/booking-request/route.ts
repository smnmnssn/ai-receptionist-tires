import { sendBookingRequestEmail } from "@/lib/email/resend";
import { normalizeOptionalRegistrationNumber } from "@/lib/normalization/registration-number";
import { handleToolRequest } from "@/lib/vapi/tool-endpoint";
import { bookingRequestSchema } from "@/schemas/booking-request.schema";

export function POST(request: Request) {
  return handleToolRequest(request, {
    toolName: "submit_booking_request",
    schema: bookingRequestSchema,
    normalize: (booking) => ({
      ...booking,
      registrationNumber: normalizeOptionalRegistrationNumber(booking.registrationNumber),
    }),
    submit: sendBookingRequestEmail,
    successMessage: "Booking request submitted successfully.",
  });
}
