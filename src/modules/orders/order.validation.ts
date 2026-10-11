import { z } from 'zod/v4';

/**
 * Schema for creating an order.
 * Uses `.strict()` so clients cannot inject `amount`, `currency`, or `status`.
 */
export const createOrderSchema = z
  .object({
    productId: z
      .string()
      .trim()
      .min(1, 'Product ID is required')
      .max(100, 'Product ID is too long'),
    planName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional(),
    customerEmail: z
      .email('Please provide a valid email address')
      .trim()
      .max(255),
    customerPhone: z
      .string()
      .trim()
      .regex(/^(?:\+?88)?01[3-9]\d{8}$/, 'Invalid Bangladeshi mobile number format'),
    customerNote: z
      .string()
      .trim()
      .max(500, 'Customer note must be at most 500 characters')
      .optional(),
    customerId: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .optional(),
  })
  .strict();

export const getOrderParamsSchema = z.object({
  id: z.string().trim().min(1, 'Order ID is required'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type GetOrderParams = z.infer<typeof getOrderParamsSchema>;
