/**
 * npm run sync:dodo
 *
 * Creates or updates every product in dodo-products.config.ts using Dodo's REST API,
 * then writes the resulting product IDs to lib/dodo-product-map.generated.json,
 * which lib/plans.ts reads at runtime.
 */
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { DODO_PRODUCTS } from '../dodo-products.config';

function loadEnv() {
  if (process.env.DODO_API_KEY) return;
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) {
      try {
        if (typeof (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile === 'function') {
          (process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile(file);
        } else {
          const content = readFileSync(file, 'utf8');
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

const apiKey = process.env.DODO_API_KEY;
if (!apiKey) {
  console.error('DODO_API_KEY not set. Export it or define it in .env / .env.local before running this script.');
  process.exit(1);
}

const environment = (process.env.DODO_ENVIRONMENT as 'test_mode' | 'live_mode') || 'test_mode';
const baseUrl = environment === 'live_mode' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';

if (environment === 'test_mode') {
  console.log('Running against Dodo TEST mode. Set DODO_ENVIRONMENT=live_mode in .env for production.\n');
} else {
  console.log('Running against Dodo LIVE mode.\n');
}

interface DodoProductResponse {
  product_id: string;
  name: string;
  description: string;
  metadata?: Record<string, string>;
  price?: { price?: number };
}

async function listProducts(): Promise<DodoProductResponse[]> {
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

    const data = (await res.json()) as { items?: DodoProductResponse[] } | DodoProductResponse[];
    if (Array.isArray(data)) return data;
    return data.items || [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Network/API error connecting to Dodo Payments: ${msg}`);
    return [];
  }
}

async function createProduct(cfg: (typeof DODO_PRODUCTS)[number]): Promise<string | null> {
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

    const product = (await res.json()) as DodoProductResponse;
    return product.product_id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error creating ${cfg.internalId}: ${msg}`);
    return null;
  }
}

async function updateProduct(productId: string, cfg: (typeof DODO_PRODUCTS)[number]) {
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
  const existingByInternalId = new Map<string, DodoProductResponse>();

  for (const product of existingProducts) {
    const internalId = product.metadata?.['internal_plan_id'];
    if (typeof internalId === 'string') existingByInternalId.set(internalId, product);
  }

  const productIdMap: Record<string, string> = {};
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const priceDriftWarnings: string[] = [];

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

    const livePriceCents = existing.price?.price;
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
