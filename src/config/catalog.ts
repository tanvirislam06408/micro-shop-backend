import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../utils/api-error.js';

export interface CatalogPlan {
  name: string;
  amountBdt: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  defaultPlan: string;
  amountBdt: string;
  oldPriceBdt?: string;
  inStock: boolean;
  plans?: CatalogPlan[];
}

/**
 * Authoritative default product catalog and pricing in BDT used to seed PostgreSQL.
 * Live edits to price, description, and stock status are persisted in the `products` table.
 */
export const SERVER_PRODUCT_CATALOG: ReadonlyArray<CatalogProduct> = [
  {
    id: 'gemini-ai-pro',
    name: 'Gemini AI Pro',
    description:
      'Advanced AI for coding, research, daily tasks with 5TB cloud storage, Veo 3.1 video generation, Nano Banana Pro, and Antigravity platform.',
    defaultPlan: '18 Months Validity',
    amountBdt: '350.00',
    oldPriceBdt: '1500.00',
    inStock: true,
  },
  {
    id: 'muse-ai',
    name: 'Muse AI ভিডিও জেনারেটর',
    description:
      'Muse AI-এর সাহায্যে নিজের লেখা ও ছবি থেকে তৈরি করুন অসাধারণ AI ভিডিও। সিনেমাটিক ভিডিও, প্রোডাক্ট বিজ্ঞাপন, স্টোরিটেলিং এবং সোশ্যাল মিডিয়া কনটেন্ট তৈরির দারুণ AI টুল।',
    defaultPlan: '২০ দিনের ওয়ারেন্টি (Personal Account)',
    amountBdt: '399.00',
    oldPriceBdt: '999.00',
    inStock: true,
  },
  {
    id: 'lovable-pro-lite',
    name: 'Lovable Pro Lite',
    description:
      'Build apps and websites by chatting with AI. 12 months validity + 300 credits, redeem on your own account, 2 months warranty.',
    defaultPlan: '12 Months Validity',
    amountBdt: '999.00',
    oldPriceBdt: '2500.00',
    inStock: true,
  },
  {
    id: 'chatgpt-plus-owner',
    name: 'ChatGPT Plus (Owner Account)',
    description:
      'Unlock GPT-4o, DALL-E 3 image generation, Advanced Data Analysis, Voice Mode, custom GPTs, and top priority processing speeds.',
    defaultPlan: 'Personal Mail Owner Access',
    amountBdt: '1550.00',
    oldPriceBdt: '2400.00',
    inStock: true,
  },
  {
    id: 'capcut-pro',
    name: 'CapCut Pro',
    description:
      'Professional video editing made simple. Unlocks premium effects, pro templates, AI captions, background removal, and 4K export.',
    defaultPlan: '1 Month Validity',
    amountBdt: '250.00',
    oldPriceBdt: '800.00',
    inStock: true,
  },
  {
    id: 'codex-api',
    name: 'Codex API',
    description:
      'Empower your IDE and development workflow with direct Codex API credits for rapid code completions and refactoring.',
    defaultPlan: 'API Access',
    amountBdt: '650.00',
    oldPriceBdt: '1200.00',
    inStock: true,
  },
  {
    id: 'claude-api',
    name: 'Claude API',
    description:
      "Access Anthropic's state-of-the-art AI model for coding, long-context text analysis, and complex problem solving via API.",
    defaultPlan: 'API Access',
    amountBdt: '600.00',
    oldPriceBdt: '1200.00',
    inStock: true,
  },
  {
    id: 'notion-pro',
    name: 'Notion Pro',
    description:
      'Organize projects, notes, and docs with unlimited Notion AI credits, custom databases, and file storage.',
    defaultPlan: 'Subscription',
    amountBdt: '650.00',
    oldPriceBdt: '1500.00',
    inStock: true,
  },
  {
    id: 'vpn-bundle',
    name: 'Premium VPNs (Nord / Proton / Surfshark)',
    description:
      'Choose from top-tier VPN providers (NordVPN, ProtonVPN, or Surfshark) for secure browsing, streaming, and global IPs.',
    defaultPlan: 'Premium Access',
    amountBdt: '600.00',
    oldPriceBdt: '1400.00',
    inStock: true,
  },
  {
    id: 'wordwall-pro',
    name: 'Wordwall Pro',
    description:
      'Create unlimited interactive teaching games, printable quizzes, and engaging educational activities.',
    defaultPlan: 'Pro Plan',
    amountBdt: '1400.00',
    oldPriceBdt: '2800.00',
    inStock: true,
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs AI Voice',
    description:
      'Generate human-like text-to-speech audio in multiple languages and clone custom voices for voiceovers.',
    defaultPlan: 'Monthly Credits',
    amountBdt: '400.00',
    oldPriceBdt: '1000.00',
    inStock: true,
  },
  {
    id: 'zoom-pro',
    name: 'Zoom Pro',
    description:
      'Host group meetings without the 40-minute limit. Includes 300 participants, cloud recording, and AI meeting summaries.',
    defaultPlan: 'Pro Plan',
    amountBdt: '1400.00',
    oldPriceBdt: '2500.00',
    inStock: true,
  },
  {
    id: 'framer-pro',
    name: 'Framer Pro',
    description:
      'Build and publish high-converting responsive websites with AI layout generation, custom domains, and zero code.',
    defaultPlan: 'Pro Plan',
    amountBdt: '6400.00',
    oldPriceBdt: '10000.00',
    inStock: true,
  },
];

export interface ResolvedProductPricing {
  productId: string;
  productName: string;
  planName: string;
  amount: Prisma.Decimal;
  currency: 'BDT';
  inStock: boolean;
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
      inStock: product.inStock,
    };
  }

  return {
    productId: product.id,
    productName: product.name,
    planName: planName?.trim() || product.defaultPlan,
    amount: new Prisma.Decimal(product.amountBdt),
    currency: 'BDT',
    inStock: product.inStock,
  };
}
