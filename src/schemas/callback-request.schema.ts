import { z } from "zod";
import type { CallbackRequest } from "@/types/callback";
import { LONG_TEXT_MAX, SHORT_TEXT_MAX, optionalText, phoneNumber, requiredText } from "./fields";

// Unknown keys are stripped (Zod default), matching the booking schema.
export const callbackRequestSchema = z.object({
  customerName: optionalText(SHORT_TEXT_MAX),
  phone: phoneNumber(),
  registrationNumber: optionalText(SHORT_TEXT_MAX),
  reason: requiredText(LONG_TEXT_MAX),
  notes: optionalText(LONG_TEXT_MAX),
}) satisfies z.ZodType<CallbackRequest>;
