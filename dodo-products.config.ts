/**
 * Desired-state config for every Dodo product Algeris sells, across every
 * brand. `npm run sync:dodo` reconciles Dodo's actual product catalog
 * against this file. internalId must exactly match the subscription_tier
 * enum values in lib/plans.ts / the Supabase profiles table.
 */

export type AlgerisBrand = 'haggle' | 'algoboost' | 'artificial-university' | 'trustlink' | 'campwork';

export type TaxCategory = 'digital_products' | 'saas' | 'services' | 'e_book' | 'edtech' | string;

export interface DodoProductConfig {
  internalId: string;
  brand: AlgerisBrand;
  name: string;
  description: string;
  priceUsd: number;
  interval: 'Month' | 'Year' | 'OneTime';
  taxCategory: TaxCategory;
}

export const DODO_PRODUCTS: DodoProductConfig[] = [
  {
    internalId: 'elite_standard',
    brand: 'haggle',
    name: 'Haggle Standard Tier (Monthly)',
    description: 'Managed transcription & AI on Haggle servers.',
    priceUsd: 8,
    interval: 'Month',
    taxCategory: 'saas',
  },
  {
    internalId: 'elite_standard_yearly',
    brand: 'haggle',
    name: 'Haggle Standard Tier (Yearly)',
    description: 'Managed transcription & AI on Haggle servers (Annual).',
    priceUsd: 80,
    interval: 'Year',
    taxCategory: 'saas',
  },
  {
    internalId: 'elite',
    brand: 'haggle',
    name: 'Haggle Pro Tier (Monthly)',
    description: 'Daily professional usage + full Haggle Pro app license + Unlimited BYOK.',
    priceUsd: 15,
    interval: 'Month',
    taxCategory: 'saas',
  },
  {
    internalId: 'elite_yearly',
    brand: 'haggle',
    name: 'Haggle Pro Tier (Yearly)',
    description: 'Daily professional usage + full Haggle Pro app license + Unlimited BYOK (Annual).',
    priceUsd: 150,
    interval: 'Year',
    taxCategory: 'saas',
  },
  {
    internalId: 'elite_max',
    brand: 'haggle',
    name: 'Haggle Elite Max (Monthly)',
    description: 'Heavy AI usage + Pro app license + Unlimited BYOK.',
    priceUsd: 25,
    interval: 'Month',
    taxCategory: 'saas',
  },
  {
    internalId: 'elite_max_yearly',
    brand: 'haggle',
    name: 'Haggle Elite Max (Yearly)',
    description: 'Heavy AI usage + Pro app license + Unlimited BYOK (Annual).',
    priceUsd: 250,
    interval: 'Year',
    taxCategory: 'saas',
  },
  {
    internalId: 'elite_ultra',
    brand: 'haggle',
    name: 'Haggle Elite Ultra (Monthly)',
    description: 'Power user AI + Pro app license + Unlimited BYOK.',
    priceUsd: 35,
    interval: 'Month',
    taxCategory: 'saas',
  },
  {
    internalId: 'elite_ultra_yearly',
    brand: 'haggle',
    name: 'Haggle Elite Ultra (Yearly)',
    description: 'Power user AI + Pro app license + Unlimited BYOK (Annual).',
    priceUsd: 350,
    interval: 'Year',
    taxCategory: 'saas',
  },
  {
    internalId: 'command',
    brand: 'haggle',
    name: 'Haggle Pro (Command)',
    description: 'Pure BYOK standalone license. Bring your own keys & local models.',
    priceUsd: 15,
    interval: 'Month',
    taxCategory: 'saas',
  },
  {
    internalId: 'command_yearly',
    brand: 'haggle',
    name: 'Haggle Pro (Annual)',
    description: 'Pure BYOK standalone license. Bring your own keys & local models.',
    priceUsd: 150,
    interval: 'Year',
    taxCategory: 'saas',
  },
  {
    internalId: 'haggle_pro_lifetime',
    brand: 'haggle',
    name: 'Haggle Pro (Lifetime)',
    description: 'Pure BYOK standalone lifetime desktop license.',
    priceUsd: 50,
    interval: 'OneTime',
    taxCategory: 'saas',
  },
];
