/**
 * SINGLE SOURCE OF TRUTH for Haggle pricing/entitlements.
 *
 * The desktop app, the website, and Dodo Payments should all read from
 * GET /v1/pricing (which returns this file) instead of hardcoding numbers.
 * This is the fix for the 3 different prices currently shown across
 * Haggle API tab / Haggle Pro tab / chat conversation.
 *
 * EDIT THE NUMBERS BELOW to your final decision, then wire Dodo product IDs
 * to the `dodoProductId` field for each plan once created (see DODO SETUP
 * in the README).
 */

export type PlanId = 'free' | 'ally' | 'command';

export interface Plan {
  id: PlanId;
  name: string;
  priceUsd: number;
  billingPeriod: 'month';
  /** Hard cap on negotiation sessions per period. */
  sessionsPerMonth: number;
  /** Extra safety net: max minutes per single session, regardless of session count.
   *  Protects margin from one very long session blowing past the cost the
   *  session-count cap assumed. */
  maxSessionMinutes: number;
  /** Which client surfaces this plan unlocks. */
  channels: Array<'extension' | 'desktop_overlay'>;
  dodoProductId: string | null; // fill in once created in Dodo dashboard
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceUsd: 0,
    billingPeriod: 'month',
    sessionsPerMonth: 2,
    maxSessionMinutes: 15,
    channels: ['extension'],
    dodoProductId: null,
    features: ['2 negotiation sessions/month', 'Extension only'],
  },
  ally: {
    id: 'ally',
    name: 'Ally', // placeholder — confirm real tier name
    priceUsd: 15,
    billingPeriod: 'month',
    sessionsPerMonth: 25,
    maxSessionMinutes: 30,
    channels: ['extension'],
    dodoProductId: null,
    features: ['25 sessions/month', 'Extension only', 'Up to 30 min/session'],
  },
  command: {
    id: 'command',
    name: 'Command',
    priceUsd: 39, // was 29 in chat — see pricing discussion, raise recommended
    billingPeriod: 'month',
    sessionsPerMonth: 100,
    maxSessionMinutes: 30,
    channels: ['extension', 'desktop_overlay'],
    dodoProductId: null,
    features: [
      '100 sessions/month',
      'Desktop app + invisible overlay',
      'Up to 30 min/session',
    ],
  },
};

export function getPlan(planId: string): Plan | null {
  return (PLANS as Record<string, Plan>)[planId] ?? null;
}
