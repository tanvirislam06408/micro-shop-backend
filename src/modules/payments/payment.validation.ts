import { z } from 'zod/v4';

/**
 * Validation for submitting a manual bKash payment.
 *
 * SECURITY REQUIREMENTS:
 * - `amount`, `currency`, and `status` are strictly forbidden from the client
 *   (`.strict()` rejects any unexpected fields). The server always determines
 *   the amount from a trusted server-side source and sets status to `pending`.
 * - `transactionId` is trimmed, normalized to uppercase, and validated as an
 *   alphanumeric bKash TrxID (8–20 characters).
 */
export const submitPaymentSchema = z
  .object({
    transactionId: z
      .string()
      .trim()
      .min(6, 'Transaction ID must be at least 6 characters')
      .max(20, 'Transaction ID must be at most 20 characters')
      .transform((val) => val.toUpperCase())
      .refine(
        (val) => /^[A-Z0-9]+$/.test(val),
        'Transaction ID must contain only alphanumeric characters',
      ),
    payerPhone: z
      .string()
      .trim()
      .regex(/^01[3-9]\d{8}$/, 'Invalid Bangladeshi mobile number format')
      .optional(),
  })
  .strict();

export const getPaymentParamsSchema = z.object({
  id: z.string().trim().min(1, 'Payment ID is required'),
});

export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>;
export type GetPaymentParams = z.infer<typeof getPaymentParamsSchema>;
