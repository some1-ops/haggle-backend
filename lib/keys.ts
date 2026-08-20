import crypto from 'crypto';
import { supabaseAdmin } from './supabase';

export interface IssueLicenseParams {
  userId?: string | null;
  email: string;
  tier?: 'pro' | 'elite' | 'command' | string;
  plan?: string;
  maxDevices?: number;
  expiresAt?: string | null;
  paymentId?: string | null;
  subscriptionId?: string | null;
  metadata?: Record<string, any>;
}

export interface IssueApiKeyParams {
  userId: string;
  name?: string;
  tier?: string;
  monthlyCreditLimit?: number | null;
  expiresAt?: string | null;
}

/**
 * Generates a formatted, high-entropy license key.
 * Format: HGL-[TIER]-[4-hex]-[4-hex]-[4-hex]-[4-hex]
 * Example: HGL-PRO-9F8A-2B7C-D3E1-4405
 */
export function generateLicenseKey(tier: string = 'pro'): string {
  const prefix = tier.toUpperCase().includes('CMD') || tier.toUpperCase().includes('COMMAND')
    ? 'HGL-CMD'
    : 'HGL-PRO';

  const randomBytes = crypto.randomBytes(8).toString('hex').toUpperCase();
  const chunk1 = randomBytes.slice(0, 4);
  const chunk2 = randomBytes.slice(4, 8);
  const chunk3 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const chunk4 = crypto.randomBytes(2).toString('hex').toUpperCase();

  return `${prefix}-${chunk1}-${chunk2}-${chunk3}-${chunk4}`;
}

/**
 * Generates an Algeris Managed API Key.
 * Format: hgl_live_<32-hex-characters>
 * Returns both the plaintext secret key (for the user) and its SHA-256 hash (for database storage).
 */
export function generateApiKey(prefix: string = 'hgl_live_'): { secretKey: string; keyHash: string; keyPrefix: string } {
  const randomHex = crypto.randomBytes(24).toString('hex');
  const secretKey = `${prefix}${randomHex}`;
  const keyHash = crypto.createHash('sha256').update(secretKey).digest('hex');
  const keyPrefix = `${secretKey.slice(0, 12)}...`;

  return { secretKey, keyHash, keyPrefix };
}

/**
 * Issues and persists a new standalone device license in Supabase.
 */
export async function issueLicense(params: IssueLicenseParams) {
  const tier = params.tier || 'pro';
  const licenseKey = generateLicenseKey(tier);
  const maxDevices = params.maxDevices || 2;

  const insertData = {
    license_key: licenseKey,
    user_id: params.userId || null,
    email: params.email.toLowerCase().trim(),
    plan: params.plan || (tier === 'command' ? 'command' : 'pro'),
    tier: tier,
    status: 'active',
    max_devices: maxDevices,
    activated_devices: [],
    expires_at: params.expiresAt || null,
    payment_id: params.paymentId || null,
    subscription_id: params.subscriptionId || null,
    metadata: params.metadata || {},
  };

  const { data, error } = await supabaseAdmin
    .from('licenses')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[KeyManager] Failed to issue license:', error);
    throw new Error(`Database error issuing license: ${error.message}`);
  }

  return {
    success: true,
    licenseKey,
    license: data,
  };
}

/**
 * Issues and persists a new API key in Supabase.
 */
export async function issueApiKey(params: IssueApiKeyParams) {
  const { secretKey, keyHash, keyPrefix } = generateApiKey();

  const insertData = {
    user_id: params.userId,
    name: params.name || 'Default API Key',
    key_hash: keyHash,
    key_prefix: keyPrefix,
    status: 'active',
    tier: params.tier || 'pro',
    monthly_credit_limit: params.monthlyCreditLimit ?? null,
    expires_at: params.expiresAt || null,
  };

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[KeyManager] Failed to issue API key:', error);
    throw new Error(`Database error issuing API key: ${error.message}`);
  }

  return {
    success: true,
    secretKey, // ONLY RETURNED ONCE UPON ISSUANCE
    keyPrefix,
    apiKey: data,
  };
}
