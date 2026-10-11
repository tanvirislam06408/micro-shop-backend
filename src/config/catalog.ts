import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../utils/api-error.js';

export interface CatalogPlan {
  name: string;
  amountBdt: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  defaultPlan: string;
  amountBdt: string;
  plans?: CatalogPlan[];
}

/**
 * Authoritative server-side product catalog and pricing in BDT.
 * All order and payment amounts MUST be resolved from this catalog on the server.
 * Client-supplied prices or amounts are never trusted.
 */
export const SERVER_PRODUCT_CATALOG: ReadonlyArray<CatalogProduct> = [
  {
    id: 'gemini-ai-pro',
    name: 'Gemini AI Pro',
    defaultPlan: '18 Months Validity',
    amountBdt: '350.00',
  },
  {
    id: 'chatgpt-plus-owner',
    name: 'ChatGPT Plus (Owner Account)',
    defaultPlan: 'Personal Mail Owner Access',
    amountBdt: '1550.00',
  },
  {
    id: 'capcut-pro',
    name: 'CapCut Pro',
    defaultPlan: '1 Month Validity',
    amountBdt: '250.00',
  },
  {
    id: 'codex-api',
    name: 'Codex API',
    defaultPlan: 'API Access',
    amountBdt: '650.00',
  },
  {
    id: 'claude-api',
    name: 'Claude API',
    defaultPlan: 'API Access',
    amountBdt: '600.00',
  },
  {
    id: 'notion-pro',
    name: 'Notion Pro',
    defaultPlan: 'Subscription',
    amountBdt: '650.00',
  },
  {
    id: 'vpn-bundle',
    name: 'Premium VPNs (Nord / Proton / Surfshark)',
    defaultPlan: 'Premium Access',
    amountBdt: '600.00',
  },
  {
    id: 'wordwall-pro',
    name: 'Wordwall Pro',
    defaultPlan: 'Pro Plan',
    amountBdt: '1400.00',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs AI Voice',
    defaultPlan: 'Monthly Credits',
    amountBdt: '400.00',
  },
  {
    id: 'zoom-pro',
    name: 'Zoom Pro',
    defaultPlan: 'Pro Plan',
    amountBdt: '1400.00',
  },
  {
    id: 'framer-pro',
    name: 'Framer Pro',
    defaultPlan: 'Pro Plan',
    amountBdt: '6400.00',
  },
];

export interface ResolvedProductPricing {
  productId: string;
  productName: string;
  planName: string;
  amount: Prisma.Decimal;
  currency: 'BDT';
}

export function resolveProductPricing(
  productId: string,
  planName?: string,
): ResolvedProductPricing {
  const product = SERVER_PRODUCT_CATALOG.find((p) => p.id === productId);
  if (!product) {
    throw ApiError.badRequest(`Unknown product ID: ${productId}`);
  }

  if (planName && product.plans && product.plans.length > 0) {
    const matchedPlan = product.plans.find((pl) => pl.name === planName);
    if (!matchedPlan) {
      throw ApiError.badRequest(
        `Invalid plan "${planName}" for product "${product.name}"`,
      );
    }
    return {
      productId: product.id,
      productName: product.name,
      planName: matchedPlan.name,
      amount: new Prisma.Decimal(matchedPlan.amountBdt),
      currency: 'BDT',
    };
  }

  return {
    productId: product.id,
    productName: product.name,
    planName: planName?.trim() || product.defaultPlan,
    amount: new Prisma.Decimal(product.amountBdt),
    currency: 'BDT',
  };
}
