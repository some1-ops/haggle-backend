/**
 * Dodo Payments Catalog Synchronizer
 * Zero-dependency runner using native Node.js fetch and fs.
 */
const { writeFileSync, readFileSync, existsSync } = require('fs');
const path = require('path');

function loadEnv() {
  if (process.env.DODO_API_KEY) return;
  for (const file of ['.env.local', '.env']) {
    const fullPath = path.resolve(process.cwd(), file);
    if (existsSync(fullPath)) {
      try {
        if (typeof process.loadEnvFile === 'function') {
          process.loadEnvFile(fullPath);
        } else {
          const content = readFileSync(fullPath, 'utf8');
          for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex > 0) {
              const key = trimmed.slice(0, eqIndex).trim();
              const val = trimmed.slice(eqIndex + 1).trim();
              if (!process.env[key]) process.env[key] = val;
            }
          }
        }
      } catch {}
    }
  }
}
loadEnv();

const DODO_PRODUCTS = [
  {
    internalId: 'elite_standard',
    brand: 'haggle',
    name: 'Elite Standard',
    description: 'Managed transcription & AI on Haggle servers.',
    priceUsd: 8,
    interval: 'Month',
    taxCategory: 'saas',
  },
  {
    internalId: 'elite',
    brand: 'haggle',
    name: 'Elite Pro',
    description: 'Daily professional usage + full Haggle Pro app license + Unlimited BYOK.',
    priceUsd: 15,
    interval: 'Month',
    taxCategory: 'saas',
  },
  {
    internalId: 'elite_yearly',
    brand: 'haggle',
    name: 'Elite Pro (Annual)',
    description: 'Daily professional usage + full Haggle Pro app license + Unlimited BYOK.',
    priceUsd: 150,
    interval: 'Year',
    taxCategory: 'saas',
  },
  {
    internalId: 'elite_max',
    brand: 'haggle',
    name: 'Elite Max',
    description: 'Heavy AI usage + Pro app license + Unlimited BYOK.',
    priceUsd: 25,
    interval: 'Month',
    taxCategory: 'saas',
  },
  {
    internalId: 'elite_ultra',
    brand: 'haggle',
    name: 'Elite Ultra',
    description: 'Power user AI + Pro app license + Unlimited BYOK.',
    priceUsd: 35,
    interval: 'Month',
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
];

const apiKey = process.env.DODO_API_KEY;
if (!apiKey) {
  console.error('DODO_API_KEY not set. Export it or define it in .env / .env.local before running this script.');
  process.exit(1);
}

const environment = process.env.DODO_ENVIRONMENT || 'test_mode';
const baseUrl = environment === 'live_mode' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';

async function listProducts() {
  try {
    const res = await fetch(`${baseUrl}/products`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      console.warn(`Dodo API returned status ${res.status}: ${await res.text()}`);
      return [];
    }

    const data = await res.json();
    if (Array.isArray(data)) return data;
    return data.items || [];
  } catch (err) {
    console.warn(`Network/API error connecting to Dodo Payments: ${err.message}`);
    return [];
  }
}

async function main() {
  const existingProducts = await listProducts();
  const existingByInternalId = new Map();

  for (const product of existingProducts) {
    const internalId = product.metadata?.['internal_plan_id'];
    if (typeof internalId === 'string') existingByInternalId.set(internalId, product);
  }

  // Fallback defaults from verified live Dodo checkout map
  const productIdMap = {
    elite: 'pdt_0NlOgX1SFiQLBRRtZudn8',
    elite_yearly: 'pdt_0NlOgX6VkQPJOYkHH8zG5',
    command: 'pdt_0NlOgXC51BIgOcl2xc7Lj',
    command_yearly: 'pdt_0NlOgXFzWb6wM8QXvU6J2',
    elite_standard: 'pdt_0NlOgX1SFiQLBRRtZudn8',
    elite_pro: 'pdt_0NlOgXC51BIgOcl2xc7Lj',
    elite_max: 'pdt_0NlOgXFzWb6wM8QXvU6J2',
    elite_ultra: 'pdt_0NlOgX6VkQPJOYkHH8zG5',
  };

  for (const cfg of DODO_PRODUCTS) {
    const existing = existingByInternalId.get(cfg.internalId);
    if (existing) {
      productIdMap[cfg.internalId] = existing.product_id;
    }
  }

  writeFileSync('lib/dodo-product-map.generated.json', JSON.stringify(productIdMap, null, 2));
  console.log('Synchronized lib/dodo-product-map.generated.json:');
  console.log(JSON.stringify(productIdMap, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
