import { z } from "zod";
import {
  BOOKING_SERVICES,
  PREFERRED_TIMES_OF_DAY,
  type BookingRequest,
} from "@/types/booking";
import {
  LONG_TEXT_MAX,
  SHORT_TEXT_MAX,
  optionalOf,
  optionalText,
  phoneNumber,
  requiredText,
} from "./fields";

// Unknown keys are stripped (Zod default) rather than rejected, so an extra
// model-invented field does not fail an otherwise valid caller request.
export const bookingRequestSchema = z.object({
  customerName: requiredText(SHORT_TEXT_MAX),
  phone: phoneNumber(),
  registrationNumber: optionalText(SHORT_TEXT_MAX),

  service: z.enum(BOOKING_SERVICES),

  description: requiredText(LONG_TEXT_MAX),

  // Free text on purpose: callers say "torsdag" or "nästa vecka", not ISO dates.
  preferredDate: optionalText(SHORT_TEXT_MAX),

  // Kept alongside preferredTimeOfDay so "klockan 2" is not reduced to AFTERNOON.
  preferredTime: optionalText(SHORT_TEXT_MAX),

  preferredTimeOfDay: optionalOf(z.enum(PREFERRED_TIMES_OF_DAY)),

  tiresStoredAtShop: optionalOf(z.boolean()),
  tireSize: optionalText(SHORT_TEXT_MAX),
  notes: optionalText(LONG_TEXT_MAX),
}) satisfies z.ZodType<BookingRequest>;
