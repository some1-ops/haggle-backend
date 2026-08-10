/**
 * SINGLE SOURCE OF TRUTH for Haggle pricing/entitlements.
 * GET /v1/pricing returns this. Website, desktop app, and Dodo product
 * descriptions should all read from here rather than hardcoding numbers.
 *
 * IDs map directly to the `subscription_tier` enum in the existing
 * `profiles` table (haggle website repo, supabase/migrations/003). 'free'
 * is kept as the internal enum value for Bootstrapper — only the display
 * name changed — so this doesn't require touching the enum. 'command' and
 * 'command_yearly' DO need adding; see supabase/migrations/011_command_tier.sql
 * in this repo.
 */

import dodoProductMap from './dodo-product-map.generated.json';

const dodoProducts = dodoProductMap as Record<string, string>;

export type SubscriptionTier =
  | 'free'
  | 'elite'
  | 'elite_yearly'
  | 'command'
  | 'command_yearly'
  | 'mercenary'; // legacy tier, still in the enum — not part of the current ladder

export interface PlanFeatures {
  byok: boolean; // marketed as "Connect Your Own AI", not "BYOK" — see chat notes
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
  /** gates which stealth/overlay mode the desktop app allows */
  undetectableTier: 'standard' | 'advanced' | 'max';
}

export interface Plan {
  id: SubscriptionTier;
  name: string;
  tagline: string;
  priceUsd: number | null; // null = contact sales (Enterprise)
  billingPeriod: 'month' | 'year' | 'custom';
  creditsPerMonth: number | null; // null = unlimited/custom — see chat notes, pick a real ceiling
  channels: Array<'extension' | 'desktop_overlay'>;
  dodoProductId: string | null;
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
  undetectableTier: 'standard',
};

const eliteFeatures: PlanFeatures = {
  ...baseFeaturesOff,
  byok: true,
  customModelProviders: true,
  exports: true,
  liveNegotiationAssistant: true,
  scenarioSandbox: true,
  meetingTranscription: true,
  undetectableTier: 'advanced',
};

const commandFeatures: PlanFeatures = {
  ...eliteFeatures,
  teamWorkspaces: true,
  sharedNegotiationMemory: true,
  negotiationCrm: true,
  liveCoaching: true,
  behavioralProfiling: true,
  bluffDetection: true,
  contractIntelligence: true,
  advancedAnalytics: true,
  teamPermissions: true,
  undetectableTier: 'max',
};

export const PLANS: Record<string, Plan> = {
  free: {
    id: 'free',
    name: 'Bootstrapper',
    tagline: 'Learn the ropes.',
    priceUsd: 0,
    billingPeriod: 'month',
    creditsPerMonth: 3, // 3 negotiations/month shared across web + desktop (same Supabase counter)
    channels: ['extension'],
    dodoProductId: null,
    features: { ...baseFeaturesOff },
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    tagline: 'For people who negotiate to win. (Most Popular)',
    priceUsd: 25,
    billingPeriod: 'month',
    creditsPerMonth: null, // unlimited — not credit-gated; rate-limited per-tier instead
    channels: ['extension', 'desktop_overlay'],
    dodoProductId: dodoProducts['elite'] ?? null,
    features: eliteFeatures,
  },
  elite_yearly: {
    id: 'elite_yearly',
    name: 'Elite (Annual)',
    tagline: 'For people who negotiate to win. (Most Popular)',
    priceUsd: 240,
    billingPeriod: 'year',
    creditsPerMonth: null, // unlimited — not credit-gated
    channels: ['extension', 'desktop_overlay'],
    dodoProductId: dodoProducts['elite_yearly'] ?? null,
    features: eliteFeatures,
  },
  command: {
    id: 'command',
    name: 'Command',
    tagline: 'For people whose negotiations move serious money.',
    priceUsd: 79,
    billingPeriod: 'month',
    creditsPerMonth: null,
    channels: ['extension', 'desktop_overlay'],
    dodoProductId: dodoProducts['command'] ?? null,
    features: commandFeatures,
  },
  command_yearly: {
    id: 'command_yearly',
    name: 'Command (Yearly)',
    tagline: 'For people whose negotiations move serious money.',
    priceUsd: 790,
    billingPeriod: 'year',
    creditsPerMonth: null,
    channels: ['extension', 'desktop_overlay'],
    dodoProductId: dodoProducts['command_yearly'] ?? null,
    features: commandFeatures,
  },
};

export function getPlan(tierId: string): Plan | null {
  return PLANS[tierId] ?? null;
}
