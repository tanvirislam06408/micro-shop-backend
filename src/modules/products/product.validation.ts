import { z } from 'zod/v4';

export const updateProductParamsSchema = z.object({
  id: z.string().trim().min(1, 'Product ID is required').max(100),
});

export const updateProductBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Product name cannot be empty').max(255).optional(),
    description: z
      .string()
      .trim()
      .min(1, 'Product description cannot be empty')
      .max(2000, 'Description must be at most 2000 characters')
      .optional(),
    defaultPlan: z.string().trim().min(1).max(255).optional(),
    amountBdt: z
      .union([z.number(), z.string()])
      .transform((val) => Number(val))
      .refine((val) => Number.isFinite(val) && val > 0 && val <= 1000000, {
        message: 'Price (amountBdt) must be a positive number',
      })
      .optional(),
    oldPriceBdt: z
      .union([z.number(), z.string(), z.null()])
      .transform((val) => (val === null || val === '' ? null : Number(val)))
      .refine((val) => val === null || (Number.isFinite(val) && val > 0 && val <= 1000000), {
        message: 'Old price must be a positive number or null',
      })
      .optional(),
    inStock: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.defaultPlan !== undefined ||
      data.amountBdt !== undefined ||
      data.oldPriceBdt !== undefined ||
      data.inStock !== undefined,
    { message: 'At least one field (inStock, amountBdt, description, name, defaultPlan) must be provided' },
  );

export const createProductBodySchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(2, 'Product slug must be at least 2 characters')
      .max(100)
      .regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase letters, numbers, and hyphens'),
    name: z.string().trim().min(1, 'Product name is required').max(255),
    description: z
      .string()
      .trim()
      .min(1, 'Product description is required')
      .max(2000, 'Description must be at most 2000 characters'),
    defaultPlan: z.string().trim().min(1, 'Default plan is required').max(255),
    amountBdt: z
      .union([z.number(), z.string()])
      .transform((val) => Number(val))
      .refine((val) => Number.isFinite(val) && val > 0 && val <= 1000000, {
        message: 'Price (amountBdt) must be a positive number',
      }),
    oldPriceBdt: z
      .union([z.number(), z.string(), z.null()])
      .transform((val) => (val === null || val === '' ? null : Number(val)))
      .refine((val) => val === null || (Number.isFinite(val) && val > 0 && val <= 1000000), {
        message: 'Old price must be a positive number or null',
      })
      .optional(),
    inStock: z.boolean().default(true),
  })
  .strict();

export type UpdateProductParams = z.infer<typeof updateProductParamsSchema>;
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>;
export type CreateProductBody = z.infer<typeof createProductBodySchema>;

