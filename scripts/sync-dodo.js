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

const apiKey = process.env.DODO_API_KEY;
if (!apiKey) {
  console.error('DODO_API_KEY not set. Export it or define it in .env / .env.local before running this script.');
  process.exit(1);
}

const environment = (process.env.DODO_ENVIRONMENT || 'test_mode');
const baseUrl = environment === 'live_mode' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';

if (environment === 'test_mode') {
  console.log('Running against Dodo TEST mode. Set DODO_ENVIRONMENT=live_mode in .env for production.\n');
} else {
  console.log('Running against Dodo LIVE mode.\n');
}

async function listProducts() {
  try {
    const res = await fetch(`${baseUrl}/products`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      console.warn(`Dodo API returned status ${res.status}: ${await res.text()}`);
      return [];
    }

    const data = await res.json();
    if (Array.isArray(data)) return data;
    return data.items || [];
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.warn(`Network/API connection note: ${msg}`);
    return [];
  }
}

async function createProduct(cfg) {
  const desiredPriceCents = Math.round(cfg.priceUsd * 100);
  try {
    const res = await fetch(`${baseUrl}/products`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: cfg.name,
        description: cfg.description,
        tax_category: cfg.taxCategory,
        metadata: { internal_plan_id: cfg.internalId, brand: cfg.brand },
        price: {
          type: 'recurring_price',
          currency: 'USD',
          price: desiredPriceCents,
          discount: 0,
          purchasing_power_parity: false,
          payment_frequency_count: 1,
          payment_frequency_interval: cfg.interval,
          subscription_period_count: 1,
          subscription_period_interval: cfg.interval,
        },
      }),
    });

    if (!res.ok) {
      console.error(`Failed to create ${cfg.internalId}: ${await res.text()}`);
      return null;
    }

    const product = await res.json();
    return product.product_id;
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error(`Error creating ${cfg.internalId}: ${msg}`);
    return null;
  }
}

async function updateProduct(productId, cfg) {
  try {
    await fetch(`${baseUrl}/products/${productId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: cfg.name,
        description: cfg.description,
      }),
    });
  } catch {}
}

async function main() {
  const existingProducts = await listProducts();
  const existingByInternalId = new Map();

  for (const product of existingProducts) {
    const internalId = product.metadata && product.metadata['internal_plan_id'];
    if (typeof internalId === 'string') existingByInternalId.set(internalId, product);
  }

  const productIdMap = {};
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const priceDriftWarnings = [];

  for (const cfg of DODO_PRODUCTS) {
    const desiredPriceCents = Math.round(cfg.priceUsd * 100);
    const existing = existingByInternalId.get(cfg.internalId);

    if (!existing) {
      console.log(`Creating ${cfg.internalId} ($${cfg.priceUsd}/${cfg.interval})...`);
      const productId = await createProduct(cfg);
      if (productId) {
        productIdMap[cfg.internalId] = productId;
        created++;
      }
      continue;
    }

    productIdMap[cfg.internalId] = existing.product_id;

    const nameOrDescChanged =
      existing.name !== cfg.name || existing.description !== cfg.description;
    if (nameOrDescChanged) {
      console.log(`Updating name/description for ${cfg.internalId}...`);
      await updateProduct(existing.product_id, cfg);
      updated++;
    } else {
      unchanged++;
    }

    const livePriceCents = existing.price && existing.price.price;
    if (livePriceCents !== undefined && livePriceCents !== desiredPriceCents) {
      priceDriftWarnings.push(
        `${cfg.internalId}: config wants $${cfg.priceUsd}, live product is $${(livePriceCents / 100).toFixed(2)}`
      );
    }
  }

  writeFileSync('lib/dodo-product-map.generated.json', JSON.stringify(productIdMap, null, 2));

  console.log(`\nDone. Created ${created}, updated ${updated}, unchanged ${unchanged}.`);
  console.log('Wrote lib/dodo-product-map.generated.json — commit this file.');

  if (priceDriftWarnings.length) {
    console.warn('\n⚠️  Price drift detected — NOT auto-corrected, Dodo does not allow it:');
    for (const w of priceDriftWarnings) console.warn(`   - ${w}`);
    console.warn(
      '   To actually change a price: add a new entry to dodo-products.config.ts with a ' +
        "new internalId (e.g. 'elite_v2'), run this script again, point checkout at the " +
        'new tier, and archive the old product once existing subscribers have migrated.'
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
