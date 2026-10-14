import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import {
  SERVER_PRODUCT_CATALOG,
  resolveProductPricing,
  type ResolvedProductPricing,
} from '../../config/catalog.js';
import { ApiError } from '../../utils/api-error.js';
import type { UpdateProductBody, CreateProductBody } from './product.validation.js';


export interface ProductDto {
  id: string;
  name: string;
  description: string;
  defaultPlan: string;
  amountBdt: string;
  oldPriceBdt: string | null;
  inStock: boolean;
  updatedAt: string;
}

function formatProductRecord(record: {
  id: string;
  name: string;
  description: string;
  defaultPlan: string;
  amountBdt: Prisma.Decimal | string | number;
  oldPriceBdt?: Prisma.Decimal | string | number | null;
  inStock: boolean;
  updatedAt?: Date;
}): ProductDto {
  const amountDec = new Prisma.Decimal(record.amountBdt.toString());
  const oldDec =
    record.oldPriceBdt !== null && record.oldPriceBdt !== undefined
      ? new Prisma.Decimal(record.oldPriceBdt.toString())
      : null;

  return {
    id: record.id,
    name: record.name,
    description: record.description,
    defaultPlan: record.defaultPlan,
    amountBdt: amountDec.toFixed(2),
    oldPriceBdt: oldDec ? oldDec.toFixed(2) : null,
    inStock: Boolean(record.inStock),
    updatedAt: (record.updatedAt ?? new Date()).toISOString(),
  };
}

let catalogSeeded = false;
let catalogSeedingPromise: Promise<void> | null = null;

export async function ensureCatalogSeeded(): Promise<void> {
  if (!prisma.product || typeof prisma.product.createMany !== 'function') {
    return;
  }
  if (catalogSeeded) {
    return;
  }
  if (catalogSeedingPromise) {
    return catalogSeedingPromise;
  }

  catalogSeedingPromise = prisma.product
    .createMany({
      data: SERVER_PRODUCT_CATALOG.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        defaultPlan: item.defaultPlan,
        amountBdt: new Prisma.Decimal(item.amountBdt),
        oldPriceBdt: item.oldPriceBdt
          ? new Prisma.Decimal(item.oldPriceBdt)
          : null,
        inStock: item.inStock,
      })),
      skipDuplicates: true,
    })
    .then(() => {
      catalogSeeded = true;
    })
    .finally(() => {
      catalogSeedingPromise = null;
    });

  return catalogSeedingPromise;
}

export async function listProducts(): Promise<ProductDto[]> {
  if (!prisma.product || typeof prisma.product.findMany !== 'function') {
    return SERVER_PRODUCT_CATALOG.map((item) => formatProductRecord(item));
  }

  await ensureCatalogSeeded();
  const dbProducts = await prisma.product.findMany();
  const byId = new Map(dbProducts.map((p) => [p.id, p]));

  const ordered: ProductDto[] = [];
  for (const catalogItem of SERVER_PRODUCT_CATALOG) {
    const dbItem = byId.get(catalogItem.id);
    if (dbItem) {
      ordered.push(formatProductRecord(dbItem));
      byId.delete(catalogItem.id);
    } else {
      ordered.push(formatProductRecord(catalogItem));
    }
  }

  for (const extra of byId.values()) {
    ordered.push(formatProductRecord(extra));
  }

  return ordered;
}

export async function resolveLiveProductForOrder(
  productId: string,
  planName?: string,
): Promise<ResolvedProductPricing> {
  const staticProduct = SERVER_PRODUCT_CATALOG.find((p) => p.id === productId);

  if (prisma.product && typeof prisma.product.findUnique === 'function') {
    let dbProduct = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!dbProduct && staticProduct && typeof prisma.product.create === 'function') {
      try {
        dbProduct = await prisma.product.create({
          data: {
            id: staticProduct.id,
            name: staticProduct.name,
            description: staticProduct.description,
            defaultPlan: staticProduct.defaultPlan,
            amountBdt: new Prisma.Decimal(staticProduct.amountBdt),
            oldPriceBdt: staticProduct.oldPriceBdt
              ? new Prisma.Decimal(staticProduct.oldPriceBdt)
              : null,
            inStock: staticProduct.inStock,
          },
        });
      } catch {
        dbProduct = await prisma.product.findUnique({
          where: { id: productId },
        });
      }
    }

    if (dbProduct) {
      if (!dbProduct.inStock) {
        throw ApiError.badRequest(
          `${dbProduct.name} is currently out of stock and cannot be ordered`,
        );
      }

      return {
        productId: dbProduct.id,
        productName: dbProduct.name,
        planName: planName?.trim() || dbProduct.defaultPlan,
        amount: new Prisma.Decimal(dbProduct.amountBdt.toString()),
        currency: 'BDT',
        inStock: dbProduct.inStock,
      };
    }
  }

  const fallback = resolveProductPricing(productId, planName);
  if (!fallback.inStock) {
    throw ApiError.badRequest(
      `${fallback.productName} is currently out of stock and cannot be ordered`,
    );
  }
  return fallback;
}

export async function updateProductByAdmin(
  productId: string,
  input: UpdateProductBody,
): Promise<ProductDto> {
  const catalogMatch = SERVER_PRODUCT_CATALOG.find((p) => p.id === productId);

  if (!prisma.product || typeof prisma.product.findUnique !== 'function') {
    throw ApiError.internal('Product repository is unavailable');
  }

  let existing = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!existing) {
    if (!catalogMatch) {
      throw ApiError.notFound(`Product not found: ${productId}`);
    }
    existing = await prisma.product.create({
      data: {
        id: catalogMatch.id,
        name: catalogMatch.name,
        description: catalogMatch.description,
        defaultPlan: catalogMatch.defaultPlan,
        amountBdt: new Prisma.Decimal(catalogMatch.amountBdt),
        oldPriceBdt: catalogMatch.oldPriceBdt
          ? new Prisma.Decimal(catalogMatch.oldPriceBdt)
          : null,
        inStock: catalogMatch.inStock,
      },
    });
  }

  const updateData: Prisma.ProductUpdateInput = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.defaultPlan !== undefined) updateData.defaultPlan = input.defaultPlan;
  if (input.amountBdt !== undefined) {
    updateData.amountBdt = new Prisma.Decimal(input.amountBdt.toFixed(2));
  }
  if (input.oldPriceBdt !== undefined) {
    updateData.oldPriceBdt =
      input.oldPriceBdt === null
        ? null
        : new Prisma.Decimal(input.oldPriceBdt.toFixed(2));
  }
  if (input.inStock !== undefined) {
    updateData.inStock = input.inStock;
  }

  const updated = await prisma.product.update({
    where: { id: existing.id },
    data: updateData,
  });

  return formatProductRecord(updated);
}

export async function createProductByAdmin(
  input: CreateProductBody,
): Promise<ProductDto> {
  if (!prisma.product || typeof prisma.product.findUnique !== 'function') {
    throw ApiError.internal('Product repository is unavailable');
  }

  const existing = await prisma.product.findUnique({
    where: { id: input.id },
  });

  if (existing) {
    throw ApiError.conflict(`A product with slug '${input.id}' already exists`);
  }

  const created = await prisma.product.create({
    data: {
      id: input.id,
      name: input.name,
      description: input.description,
      defaultPlan: input.defaultPlan,
      amountBdt: new Prisma.Decimal(input.amountBdt.toFixed(2)),
      oldPriceBdt:
        input.oldPriceBdt !== undefined && input.oldPriceBdt !== null
          ? new Prisma.Decimal(input.oldPriceBdt.toFixed(2))
          : null,
      inStock: input.inStock ?? true,
    },
  });

  return formatProductRecord(created);
}

export async function deleteProductByAdmin(productId: string) {
  if (!prisma.product || typeof prisma.product.findUnique !== 'function') {
    throw ApiError.internal('Product repository is unavailable');
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw ApiError.notFound(`Product not found: ${productId}`);
  }

  // Check if any order references this product
  const ordersCount = await prisma.order.count({
    where: { productId },
  });

  if (ordersCount > 0) {
    // Soft-delete to preserve all historical order snapshots and business reports
    const deactivated = await prisma.product.update({
      where: { id: productId },
      data: { inStock: false },
    });
    return {
      softDeleted: true,
      message: `Product has ${ordersCount} order(s) in history. It has been safely deactivated (marked out of stock) to preserve historical reporting.`,
      product: formatProductRecord(deactivated),
    };
  }

  // If no orders exist, hard delete safely
  await prisma.product.delete({
    where: { id: productId },
  });

  return {
    softDeleted: false,
    message: `Product '${product.name}' was permanently removed.`,
    product: formatProductRecord(product),
  };
}

