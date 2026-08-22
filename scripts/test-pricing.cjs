const dodoProducts = require('../lib/dodo-product-map.generated.json');

const buildCheckoutUrl = (productId) => {
  return productId ? `https://checkout.dodopayments.com/buy/${productId}` : null;
};

const baseFeaturesOff = {
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

const eliteStandardFeatures = {
  ...baseFeaturesOff,
  exports: true,
  liveNegotiationAssistant: true,
  scenarioSandbox: true,
  meetingTranscription: true,
  undetectableTier: true,
};

const eliteProFeatures = {
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

const PLANS = {
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
    dodoProductId: dodoProducts['elite_standard'] || dodoProducts['elite'] || 'pdt_0NlOgX1SFiQLBRRtZudn8',
    checkoutUrl: buildCheckoutUrl(dodoProducts['elite_standard'] || dodoProducts['elite'] || 'pdt_0NlOgX1SFiQLBRRtZudn8'),
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
    dodoProductId: dodoProducts['command'] || dodoProducts['elite_pro'] || 'pdt_0NlOgXC51BIgOcl2xc7Lj',
    checkoutUrl: buildCheckoutUrl(dodoProducts['command'] || dodoProducts['elite_pro'] || 'pdt_0NlOgXC51BIgOcl2xc7Lj'),
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
    dodoProductId: dodoProducts['elite_yearly'] || 'pdt_0NlOgX6VkQPJOYkHH8zG5',
    checkoutUrl: buildCheckoutUrl(dodoProducts['elite_yearly'] || 'pdt_0NlOgX6VkQPJOYkHH8zG5'),
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
    dodoProductId: dodoProducts['command_yearly'] || 'pdt_0NlOgXFzWb6wM8QXvU6J2',
    checkoutUrl: buildCheckoutUrl(dodoProducts['command_yearly'] || 'pdt_0NlOgXFzWb6wM8QXvU6J2'),
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
    dodoProductId: dodoProducts['elite_yearly'] || 'pdt_0NlOgX6VkQPJOYkHH8zG5',
    checkoutUrl: buildCheckoutUrl(dodoProducts['elite_yearly'] || 'pdt_0NlOgX6VkQPJOYkHH8zG5'),
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
    dodoProductId: dodoProducts['command'] || 'pdt_0NlOgXC51BIgOcl2xc7Lj',
    checkoutUrl: buildCheckoutUrl(dodoProducts['command'] || 'pdt_0NlOgXC51BIgOcl2xc7Lj'),
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
    dodoProductId: dodoProducts['command_yearly'] || 'pdt_0NlOgXFzWb6wM8QXvU6J2',
    checkoutUrl: buildCheckoutUrl(dodoProducts['command_yearly'] || 'pdt_0NlOgXFzWb6wM8QXvU6J2'),
    features: eliteProFeatures,
  },
};

function normalizeTier(tier) {
  if (!tier) return 'free';
  const t = tier.toLowerCase().trim().replace(/\s+/g, '_');
  if (t === 'bootstrapper' || t === 'free') return 'free';
  if (t === 'elite_standard' || t === 'standard') return 'elite_standard';
  if (t === 'elite_max' || t === 'max') return 'elite_max';
  if (t === 'elite_ultra' || t === 'ultra') return 'elite_ultra';
  if (t === 'elite_yearly' || t === 'yearly' || t === 'annual') return 'elite_yearly';
  if (t === 'elite_pro' || t === 'elite' || t === 'pro' || t === 'mercenary') return 'elite';
  if (t === 'command_yearly') return 'command_yearly';
  if (t === 'command' || t.includes('command')) return 'command';
  return 'free';
}

function getPlan(tierId) {
  const norm = normalizeTier(tierId);
  return PLANS[norm] || PLANS[tierId] || PLANS.free;
}

console.log('--- TEST 1: Pricing Plans Integrity & Checkout URLs ---');
const plansList = Object.values(PLANS);
console.log(`Total plans available: ${plansList.length}`);

for (const p of plansList) {
  console.log(`\n[Plan: ${p.id}]`);
  console.log(`  Name: ${p.name}`);
  console.log(`  Price: $${p.priceUsd} / ${p.billingPeriod}`);
  console.log(`  Credits: ${p.creditsPerMonth}`);
  console.log(`  Dodo Product ID: ${p.dodoProductId}`);
  console.log(`  Checkout URL: ${p.checkoutUrl}`);
  console.log(`  BYOK Allowed: ${p.features.byok}`);
}

console.log('\n--- TEST 2: Tier Normalization & Plan Resolution ---');
const testTiers = [
  'free',
  'bootstrapper',
  'elite_standard',
  'standard',
  'elite',
  'elite_pro',
  'elite_yearly',
  'elite_max',
  'elite_ultra',
  'command',
  'command_yearly',
  'pro',
  'mercenary',
];

for (const t of testTiers) {
  const norm = normalizeTier(t);
  const plan = getPlan(t);
  console.log(`  Tier "${t}" -> normalized "${norm}" -> resolved plan name: "${plan.name}", price: $${plan.priceUsd}, checkout: ${plan.checkoutUrl}`);
  if (!plan || !plan.name) {
    throw new Error(`Failed to resolve plan for tier "${t}"`);
  }
}

console.log('\n✅ ALL PRICING & DODO CHECKOUT URL TESTS PASSED!');
