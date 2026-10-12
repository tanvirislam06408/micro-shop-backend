import { z } from 'zod/v4';

/**
 * Validation for submitting a manual bKash payment.
 *
 * SECURITY REQUIREMENTS:
 * - `amount`, `currency`, `status`, `verifiedBy`, and `verifiedAt` are strictly
 *   forbidden from the client (`.strict()` rejects any unexpected fields).
 *   The server always determines the amount from the trusted Order record
 *   and sets status to `pending`.
 * - `transactionId` is trimmed, normalized to uppercase, and validated as an
 *   alphanumeric bKash TrxID (6–20 characters).
 * - Never asks for or accepts bKash PIN, OTP, or password.
 */
export const submitPaymentSchema = z
  .object({
    orderId: z
      .string()
      .trim()
      .min(1, 'Order ID cannot be empty')
      .max(100)
      .optional(),
    orderToken: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional(),
    customerId: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional(),
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
    method: z.enum(['manual_bkash', 'manual_nagad']).optional(),
  })
  .strict();

export const getPaymentParamsSchema = z.object({
  id: z.string().trim().min(1, 'Payment ID is required'),
});

export const adminListPaymentsQuerySchema = z.object({
  status: z.enum(['pending', 'verified', 'rejected']).optional(),
  method: z.enum(['manual_bkash', 'manual_nagad']).optional(),
});

export const adminVerifyPaymentBodySchema = z
  .object({
    status: z.enum(['verified', 'rejected']),
    rejectionReason: z
      .string()
      .trim()
      .max(500, 'Rejection reason must be at most 500 characters')
      .optional(),
    adminNote: z
      .string()
      .trim()
      .max(500, 'Admin note must be at most 500 characters')
      .optional(),
  })
  .strict();

export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>;
export type GetPaymentParams = z.infer<typeof getPaymentParamsSchema>;
export type AdminListPaymentsQuery = z.infer<typeof adminListPaymentsQuerySchema>;
export type AdminVerifyPaymentBody = z.infer<typeof adminVerifyPaymentBodySchema>;
