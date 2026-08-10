/**
 * Desired-state config for every Dodo product Algeris sells, across every
 * brand. `npm run sync:dodo` reconciles Dodo's actual product catalog
 * against this file. internalId must exactly match the subscription_tier
 * enum values in lib/plans.ts / the Supabase profiles table — the sync
 * script stamps it into each product's metadata, which is how it finds
 * "this Dodo product IS Haggle Elite Monthly" on every future run without
 * you ever touching the dashboard.
 *
 * Adding a new Algeris brand later (Algoboost, Artificial University,
 * TrustLink) means adding entries here with a new `brand` value — the sync
 * script itself doesn't need to change.
 */

export type AlgerisBrand = 'haggle' | 'algoboost' | 'artificial-university' | 'trustlink' | 'campwork';

export type TaxCategory = 'digital_products' | 'saas' | 'services' | 'e_book' | 'edtech' | string;

export interface DodoProductConfig {
  internalId: string;
  brand: AlgerisBrand;
  name: string;
  description: string;
  priceUsd: number;
  interval: 'Month' | 'Year';
  taxCategory: TaxCategory;
}

export const DODO_PRODUCTS: DodoProductConfig[] = [
  {
    internalId: 'elite',
    brand: 'haggle',
    name: 'Haggle Elite',
    description: 'For people who negotiate to win.',
    priceUsd: 25,
    interval: 'Month',
    taxCategory: 'saas',
  },
  {
    internalId: 'elite_yearly',
    brand: 'haggle',
    name: 'Haggle Elite (Yearly)',
    description: 'For people who negotiate to win.',
    priceUsd: 240,
    interval: 'Year',
    taxCategory: 'saas',
  },
  {
    internalId: 'command',
    brand: 'haggle',
    name: 'Haggle Command',
    description: 'For people whose negotiations move serious money.',
    priceUsd: 79,
    interval: 'Month',
    taxCategory: 'saas',
  },
  {
    internalId: 'command_yearly',
    brand: 'haggle',
    name: 'Haggle Command (Yearly)',
    description: 'For people whose negotiations move serious money.',
    priceUsd: 790,
    interval: 'Year',
    taxCategory: 'saas',
  },
];
