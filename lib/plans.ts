/**
 * SINGLE SOURCE OF TRUTH for Haggle pricing/entitlements.
 * GET /v1/pricing returns this. Website, desktop app, and Dodo product
 * descriptions all read from here to stay perfectly synchronized.
 */

import dodoProductMap from './dodo-product-map.generated.json';

const dodoProducts = dodoProductMap as Record<string, string>;

export type SubscriptionTier =
  | 'free'
  | 'bootstrapper'
  | 'elite'
  | 'elite_standard'
  | 'elite_standard_yearly'
  | 'elite_pro'
  | 'elite_yearly'
  | 'elite_max'
  | 'elite_max_yearly'
  | 'elite_ultra'
  | 'elite_ultra_yearly'
  | 'command'
  | 'command_yearly'
  | 'haggle_pro_lifetime'
  | 'mercenary'
  | 'pro';

export interface PlanFeatures {
  byok: boolean;
  customModelProviders: boolean;
  exports: boolean;
  liveNegotiationAssistant: boolean;
  scenarioSandbox: boolean;
  meetingTranscription: boolean;
  teamWorkspaces: boolean;
  sharedNegotiationMemory: boolean;
  negotiationCrm: boolean;
  liveCoaching: boolean;
  behavioralProfiling: boolean;
  bluffDetection: boolean;
  contractIntelligence: boolean;
  advancedAnalytics: boolean;
  teamPermissions: boolean;
  undetectableTier: boolean | 'standard' | 'advanced' | 'max';
}

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  priceUsd: number | null;
  billingPeriod: 'month' | 'year' | 'free' | 'monthly' | 'yearly' | 'lifetime' | 'custom';
  creditsPerMonth: number | null;
  channels: string[];
  dodoProductId: string | null;
  checkoutUrl: string | null;
  features: PlanFeatures;
}

const baseFeaturesOff: PlanFeatures = {
  byok: false,
  customModelProviders: false,
  exports: false,
  liveNegotiationAssistant: false,
  scenarioSandbox: false,
  meetingTranscription: false,
  teamWorkspaces: false,
  sharedNegotiationMemory: false,
  negotiationCrm: false,
  liveCoaching: false,
  behavioralProfiling: false,
  bluffDetection: false,
  contractIntelligence: false,
  advancedAnalytics: false,
  teamPermissions: false,
  undetectableTier: false,
};

const eliteStandardFeatures: PlanFeatures = {
  ...baseFeaturesOff,
  exports: true,
  liveNegotiationAssistant: true,
  scenarioSandbox: true,
  meetingTranscription: true,
  undetectableTier: true,
};

const eliteProFeatures: PlanFeatures = {
  byok: true,
  customModelProviders: true,
  exports: true,
  liveNegotiationAssistant: true,
  scenarioSandbox: true,
  meetingTranscription: true,
  teamWorkspaces: true,
  sharedNegotiationMemory: true,
  negotiationCrm: true,
  liveCoaching: true,
  behavioralProfiling: true,
  bluffDetection: true,
  contractIntelligence: true,
  advancedAnalytics: true,
  teamPermissions: true,
  undetectableTier: true,
};

const buildCheckoutUrl = (productId: string | null | undefined): string | null => {
  return productId ? `https://checkout.dodopayments.com/buy/${productId}` : null;
};

export const PLANS: Record<string, Plan> = {
  free: {
    id: 'free',
    name: 'Bootstrapper',
    tagline: 'Learn the ropes with 3 free trial meeting credits.',
    priceUsd: 0,
    billingPeriod: 'free',
    creditsPerMonth: 3,
    channels: ['Web App', 'Desktop App'],
    dodoProductId: null,
    checkoutUrl: null,
    features: { ...baseFeaturesOff },
  },

  elite_standard: {
    id: 'elite_standard',
    name: 'Elite Standard',
    tagline: 'Managed transcription & AI on Haggle servers.',
    priceUsd: 8,
    billingPeriod: 'monthly',
    creditsPerMonth: 50,
    channels: ['Web App', 'Desktop App', 'Telegram Bot'],
    dodoProductId: dodoProducts['elite_standard'] || 'pdt_0NlOgX1SFiQLBRRtZudn8',
    checkoutUrl: buildCheckoutUrl(dodoProducts['elite_standard'] || 'pdt_0NlOgX1SFiQLBRRtZudn8'),
    features: eliteStandardFeatures,
  },

  elite_standard_yearly: {
    id: 'elite_standard_yearly',
    name: 'Elite Standard (Annual)',
    tagline: 'Managed transcription & AI on Haggle servers (Annual plan).',
    priceUsd: 80,
    billingPeriod: 'yearly',
    creditsPerMonth: 50,
    channels: ['Web App', 'Desktop App', 'Telegram Bot'],
    dodoProductId: dodoProducts['elite_standard_yearly'] || 'pdt_0NlOgX6VkQPJOYkHH8zG5',
    checkoutUrl: buildCheckoutUrl(dodoProducts['elite_standard_yearly'] || 'pdt_0NlOgX6VkQPJOYkHH8zG5'),
    features: eliteStandardFeatures,
  },

  elite: {
    id: 'elite',
    name: 'Elite Pro',
    tagline: 'Daily professional usage + full Haggle Pro app license + Unlimited BYOK.',
    priceUsd: 15,
    billingPeriod: 'monthly',
    creditsPerMonth: 150,
    channels: ['Web App', 'Desktop App', 'Telegram Bot'],
    dodoProductId: dodoProducts['elite'] || dodoProducts['elite_pro'] || 'pdt_0NlOgXC51BIgOcl2xc7Lj',
    checkoutUrl: buildCheckoutUrl(dodoProducts['elite'] || dodoProducts['elite_pro'] || 'pdt_0NlOgXC51BIgOcl2xc7Lj'),
    features: eliteProFeatures,
  },

  elite_yearly: {
    id: 'elite_yearly',
    name: 'Elite Pro (Annual)',
    tagline: 'Daily professional usage + full Haggle Pro app license + Unlimited BYOK.',
    priceUsd: 150,
    billingPeriod: 'yearly',
    creditsPerMonth: 150,
    channels: ['Web App', 'Desktop App', 'Telegram Bot'],
    dodoProductId: dodoProducts['elite_yearly'] || 'pdt_0NlOgXFzWb6wM8QXvU6J2',
    checkoutUrl: buildCheckoutUrl(dodoProducts['elite_yearly'] || 'pdt_0NlOgXFzWb6wM8QXvU6J2'),
    features: eliteProFeatures,
  },

  elite_max: {
    id: 'elite_max',
    name: 'Elite Max',
    tagline: 'Heavy AI usage + Pro app license + Unlimited BYOK.',
    priceUsd: 25,
    billingPeriod: 'monthly',
    creditsPerMonth: 400,
    channels: ['Web App', 'Desktop App', 'Telegram Bot'],
    dodoProductId: dodoProducts['elite_max'] || 'pdt_0NlxMU1pU1un3FHRdm36Y',
    checkoutUrl: buildCheckoutUrl(dodoProducts['elite_max'] || 'pdt_0NlxMU1pU1un3FHRdm36Y'),
    features: eliteProFeatures,
  },

  elite_max_yearly: {
    id: 'elite_max_yearly',
    name: 'Elite Max (Annual)',
    tagline: 'Heavy AI usage + Pro app license + Unlimited BYOK (Annual plan).',
    priceUsd: 250,
    billingPeriod: 'yearly',
    creditsPerMonth: 400,
    channels: ['Web App', 'Desktop App', 'Telegram Bot'],
    dodoProductId: dodoProducts['elite_max_yearly'] || 'pdt_0NlxMU78rx4Ciw17x4FlW',
    checkoutUrl: buildCheckoutUrl(dodoProducts['elite_max_yearly'] || 'pdt_0NlxMU78rx4Ciw17x4FlW'),
    features: eliteProFeatures,
  },

  elite_ultra: {
    id: 'elite_ultra',
    name: 'Elite Ultra',
    tagline: 'Power user AI + Pro app license + Unlimited BYOK.',
    priceUsd: 35,
    billingPeriod: 'monthly',
    creditsPerMonth: 1000,
    channels: ['Web App', 'Desktop App', 'Telegram Bot'],
    dodoProductId: dodoProducts['elite_ultra'] || 'pdt_0NlxMUBjhNhSr5fPnIHPy',
    checkoutUrl: buildCheckoutUrl(dodoProducts['elite_ultra'] || 'pdt_0NlxMUBjhNhSr5fPnIHPy'),
    features: eliteProFeatures,
  },

  elite_ultra_yearly: {
    id: 'elite_ultra_yearly',
    name: 'Elite Ultra (Annual)',
    tagline: 'Power user AI + Pro app license + Unlimited BYOK (Annual plan).',
    priceUsd: 350,
    billingPeriod: 'yearly',
    creditsPerMonth: 1000,
    channels: ['Web App', 'Desktop App', 'Telegram Bot'],
    dodoProductId: dodoProducts['elite_ultra_yearly'] || 'pdt_0NlxMUFbwbqYB1o1KjjOE',
    checkoutUrl: buildCheckoutUrl(dodoProducts['elite_ultra_yearly'] || 'pdt_0NlxMUFbwbqYB1o1KjjOE'),
    features: eliteProFeatures,
  },

  command: {
    id: 'command',
    name: 'Haggle Pro (Command)',
    tagline: 'Pure BYOK standalone license. Bring your own keys & local models.',
    priceUsd: 15,
    billingPeriod: 'monthly',
    creditsPerMonth: null,
    channels: ['Desktop App', 'Web App'],
    dodoProductId: dodoProducts['command'] || 'pdt_0NlxMUKU6gXHdzBTONldp',
    checkoutUrl: buildCheckoutUrl(dodoProducts['command'] || 'pdt_0NlxMUKU6gXHdzBTONldp'),
    features: eliteProFeatures,
  },

  command_yearly: {
    id: 'command_yearly',
    name: 'Haggle Pro (Annual)',
    tagline: 'Pure BYOK standalone license. Bring your own keys & local models.',
    priceUsd: 150,
    billingPeriod: 'yearly',
    creditsPerMonth: null,
    channels: ['Desktop App', 'Web App'],
    dodoProductId: dodoProducts['command_yearly'] || 'pdt_0NlxMUOm31CNCUIf28Zr1',
    checkoutUrl: buildCheckoutUrl(dodoProducts['command_yearly'] || 'pdt_0NlxMUOm31CNCUIf28Zr1'),
    features: eliteProFeatures,
  },

  haggle_pro_lifetime: {
    id: 'haggle_pro_lifetime',
    name: 'Haggle Pro (Lifetime)',
    tagline: 'Pure BYOK standalone lifetime desktop license.',
    priceUsd: 50,
    billingPeriod: 'lifetime',
    creditsPerMonth: null,
    channels: ['Desktop App', 'Web App'],
    dodoProductId: dodoProducts['haggle_pro_lifetime'] || 'pdt_0NlxMUU4haRgZwQ2pYGMA',
    checkoutUrl: buildCheckoutUrl(dodoProducts['haggle_pro_lifetime'] || 'pdt_0NlxMUU4haRgZwQ2pYGMA'),
    features: eliteProFeatures,
  },
};

/**
 * Normalizes any subscription tier string to the matching canonical plan ID.
 */
export function normalizeTier(tier: string | undefined | null): string {
  if (!tier) return 'free';
  const t = tier.toLowerCase().trim().replace(/\s+/g, '_');
  if (t === 'bootstrapper' || t === 'free') return 'free';
  if (t === 'elite_standard_yearly' || (t.includes('standard') && (t.includes('year') || t.includes('annual')))) return 'elite_standard_yearly';
  if (t === 'elite_standard' || t === 'standard') return 'elite_standard';
  if (t === 'elite_max_yearly' || (t.includes('max') && (t.includes('year') || t.includes('annual')))) return 'elite_max_yearly';
  if (t === 'elite_max' || t === 'max') return 'elite_max';
  if (t === 'elite_ultra_yearly' || (t.includes('ultra') && (t.includes('year') || t.includes('annual')))) return 'elite_ultra_yearly';
  if (t === 'elite_ultra' || t === 'ultra') return 'elite_ultra';
  if (t === 'elite_yearly' || t === 'yearly' || t === 'annual') return 'elite_yearly';
  if (t === 'elite_pro' || t === 'elite' || t === 'pro' || t === 'mercenary') return 'elite';
  if (t === 'command_yearly') return 'command_yearly';
  if (t === 'haggle_pro_lifetime' || t === 'lifetime' || t.includes('lifetime')) return 'haggle_pro_lifetime';
  if (t === 'command' || t.includes('command')) return 'command';
  return 'free';
}

/**
 * Returns the matching Plan object for any given tier ID or alias.
 */
export function getPlan(tierId: string | undefined | null): Plan {
  const norm = normalizeTier(tierId);
  return PLANS[norm] || PLANS[tierId || ''] || PLANS.free;
}
