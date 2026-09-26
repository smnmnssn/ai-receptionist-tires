import { sendCallbackRequestEmail } from "@/lib/email/resend";
import { normalizeOptionalRegistrationNumber } from "@/lib/normalization/registration-number";
import { handleToolRequest } from "@/lib/vapi/tool-endpoint";
import { callbackRequestSchema } from "@/schemas/callback-request.schema";

export function POST(request: Request) {
  return handleToolRequest(request, {
    toolName: "submit_callback_request",
    schema: callbackRequestSchema,
    normalize: (callback) => ({
      ...callback,
      registrationNumber: normalizeOptionalRegistrationNumber(callback.registrationNumber),
    }),
    submit: sendCallbackRequestEmail,
    successMessage: "Callback request submitted successfully.",
  });
}
