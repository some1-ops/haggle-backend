/**
 * npm run sync:dodo
 *
 * Creates or updates every product in dodo-products.config.ts using Dodo's REST API,
 * then writes the resulting product IDs to lib/dodo-product-map.generated.json,
 * which lib/plans.ts reads at runtime.
 */
import { writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { DODO_PRODUCTS, DodoProductConfig } from '../dodo-products.config';

function loadEnv() {
  if (process.env.DODO_API_KEY) return;
  for (const file of ['.env.local', '.env']) {
    const fullPath = path.resolve(process.cwd(), file);
    if (existsSync(fullPath)) {
      try {
        if (typeof (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile === 'function') {
          (process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile(fullPath);
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
      } catch { }
    }
  }
}
loadEnv();

const apiKey = process.env.DODO_API_KEY || process.env.DODO_PAYMENTS_API_KEY;
if (!apiKey) {
  console.error('DODO_API_KEY / DODO_PAYMENTS_API_KEY not set. Export it or define it in .env / .env.local before running this script.');
  process.exit(1);
}

const environment = (process.env.DODO_ENVIRONMENT as 'test_mode' | 'live_mode') || 'live_mode';
const baseUrl = environment === 'live_mode' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';

console.log(`Running against Dodo [${environment.toUpperCase()}] at ${baseUrl}\n`);

interface DodoProductResponse {
  product_id: string;
  name: string;
  description: string;
  metadata?: Record<string, string>;
  price?: number | { price?: number };
  is_recurring?: boolean;
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

async function createProduct(cfg: DodoProductConfig): Promise<string | null> {
  const desiredPriceCents = Math.round(cfg.priceUsd * 100);
  try {
    const pricePayload = cfg.interval === 'OneTime'
      ? {
          type: 'one_time_price',
          currency: 'USD',
          price: desiredPriceCents,
          discount: 0,
          purchasing_power_parity: false,
        }
      : {
          type: 'recurring_price',
          currency: 'USD',
          price: desiredPriceCents,
          discount: 0,
          purchasing_power_parity: false,
          payment_frequency_count: 1,
          payment_frequency_interval: cfg.interval,
          subscription_period_count: 10,
          subscription_period_interval: 'Year',
        };

    const res = await fetch(`${baseUrl}/products`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: cfg.name,
        description: cfg.description,
        tax_category: cfg.taxCategory || 'saas',
        metadata: { internal_plan_id: cfg.internalId, brand: cfg.brand },
        price: pricePayload,
      }),
    });

    if (!res.ok) {
      console.error(`❌ Failed to create ${cfg.internalId} (${cfg.name}): ${await res.text()}`);
      return null;
    }

    const product = (await res.json()) as DodoProductResponse;
    console.log(`✅ Successfully created ${cfg.internalId} -> Product ID: ${product.product_id}`);
    return product.product_id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Error creating ${cfg.internalId}: ${msg}`);
    return null;
  }
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findExistingProduct(cfg: DodoProductConfig, existingProducts: DodoProductResponse[]): DodoProductResponse | undefined {
  const desiredPriceCents = Math.round(cfg.priceUsd * 100);

  // 1. Match by metadata internal_plan_id
  const byMeta = existingProducts.find((p) => p.metadata?.['internal_plan_id'] === cfg.internalId);
  if (byMeta) return byMeta;

  // 2. Match by normalized name and price
  const cfgNorm = normalizeName(cfg.name);
  const byNameAndPrice = existingProducts.find((p) => {
    const pNorm = normalizeName(p.name);
    const pPrice = typeof p.price === 'number' ? p.price : p.price?.price;
    const priceMatches = pPrice === desiredPriceCents;
    const nameMatches = pNorm === cfgNorm || pNorm.includes(cfgNorm) || cfgNorm.includes(pNorm);
    return nameMatches && priceMatches;
  });
  if (byNameAndPrice) return byNameAndPrice;

  // 3. Fallback matching for existing specific products in Dodo
  if (cfg.internalId === 'elite_standard' || cfg.internalId === 'standard') {
    return existingProducts.find((p) => p.product_id === 'pdt_0NlOgX1SFiQLBRRtZudn8' || (p.name.includes('Standard') && p.name.includes('Monthly')));
  }
  if (cfg.internalId === 'elite_standard_yearly') {
    return existingProducts.find((p) => p.product_id === 'pdt_0NlOgX6VkQPJOYkHH8zG5' || (p.name.includes('Standard') && p.name.includes('Yearly')));
  }
  if (cfg.internalId === 'elite' || cfg.internalId === 'elite_pro') {
    return existingProducts.find((p) => p.product_id === 'pdt_0NlOgXC51BIgOcl2xc7Lj' || (p.name.includes('Pro') && p.name.includes('Monthly')));
  }
  if (cfg.internalId === 'elite_yearly') {
    return existingProducts.find((p) => p.product_id === 'pdt_0NlOgXFzWb6wM8QXvU6J2' || (p.name.includes('Pro') && p.name.includes('Yearly')));
  }

  return undefined;
}

async function main() {
  const existingProducts = await listProducts();
  console.log(`Found ${existingProducts.length} existing products in Dodo Payments.`);
  for (const ep of existingProducts) {
    const pr = typeof ep.price === 'number' ? ep.price : ep.price?.price;
    console.log(`  - [${ep.product_id}] ${ep.name} ($${pr ? pr / 100 : '?'})`);
  }
  console.log('');

  const productIdMap: Record<string, string> = {};
  let created = 0;
  let reused = 0;

  for (const cfg of DODO_PRODUCTS) {
    const existing = findExistingProduct(cfg, existingProducts);

    if (existing) {
      console.log(`Reusing existing product for ${cfg.internalId} (${cfg.name}) -> ${existing.product_id}`);
      productIdMap[cfg.internalId] = existing.product_id;
      reused++;
    } else {
      console.log(`Provisioning missing product: ${cfg.internalId} (${cfg.name} - $${cfg.priceUsd}/${cfg.interval})...`);
      const productId = await createProduct(cfg);
      if (productId) {
        productIdMap[cfg.internalId] = productId;
        created++;
      } else {
        console.error(`⚠️ Could not create product for ${cfg.internalId}`);
      }
    }
  }

  // Fallback aliases so command maps cleanly if not distinct
  if (!productIdMap['command'] && productIdMap['elite']) {
    productIdMap['command'] = productIdMap['elite'];
  }
  if (!productIdMap['command_yearly'] && productIdMap['elite_yearly']) {
    productIdMap['command_yearly'] = productIdMap['elite_yearly'];
  }
  if (!productIdMap['elite_pro'] && productIdMap['elite']) {
    productIdMap['elite_pro'] = productIdMap['elite'];
  }

  const generatedPath = path.resolve(__dirname, '../lib/dodo-product-map.generated.json');
  writeFileSync(generatedPath, JSON.stringify(productIdMap, null, 2));

  console.log(`\n🎉 Synchronization complete: ${created} created, ${reused} reused.`);
  console.log(`Generated product map at ${generatedPath}:`);
  console.log(JSON.stringify(productIdMap, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
