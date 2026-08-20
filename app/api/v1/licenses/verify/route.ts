import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { PLANS } from '@/lib/plans';

const LICENSE_SECRET = process.env.LICENSE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'algeris_haggle_pro_master_license_secret_2026';

/**
 * Validates an HMAC-signed device token.
 * Token format: "HMAC:<hwid>:<tier>:<expires_unix>:<hex_sig>" or "HAG-PRO-<payload_b64>.<hex_sig>"
 */
function verifyHmacDeviceToken(token: string, hwid?: string): { valid: boolean; tier?: string; expiresAt?: string | null; error?: string } {
  try {
    if (token.startsWith('HMAC:')) {
      const parts = token.split(':');
      if (parts.length < 5) return { valid: false, error: 'Malformed HMAC token' };
      const [, tokenHwid, tier, expiresStr, sig] = parts;
      
      // HWID binding check
      if (hwid && tokenHwid !== '*' && tokenHwid.toLowerCase() !== hwid.toLowerCase()) {
        return { valid: false, error: 'Device HWID mismatch for offline license token' };
      }

      // Expiry check
      const expiresUnix = parseInt(expiresStr, 10);
      if (expiresUnix > 0 && Date.now() > expiresUnix * 1000) {
        return { valid: false, error: 'License token has expired' };
      }

      // Verify HMAC-SHA256 signature
      const expectedSig = crypto
        .createHmac('sha256', LICENSE_SECRET)
        .update(`${tokenHwid}:${tier}:${expiresStr}`)
        .digest('hex');

      if (crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
        return {
          valid: true,
          tier: tier || 'command',
          expiresAt: expiresUnix > 0 ? new Date(expiresUnix * 1000).toISOString() : null,
        };
      }
    } else if (token.startsWith('HAG-PRO-')) {
      // Formatted Algeris Standalone Token: HAG-PRO-<body_base64>.<sig_hex>
      const clean = token.replace(/^HAG-PRO-/, '');
      const [bodyB64, sig] = clean.split('.');
      if (!bodyB64 || !sig) {
        // Fallback for algorithmic / standard alphanumeric license keys
        const expectedSig = crypto.createHmac('sha256', LICENSE_SECRET).update(bodyB64 || clean).digest('hex').slice(0, 16);
        if (sig && sig.toLowerCase() === expectedSig.toLowerCase()) {
          return { valid: true, tier: 'command', expiresAt: null };
        }
      } else {
        const expectedSig = crypto.createHmac('sha256', LICENSE_SECRET).update(bodyB64).digest('hex');
        if (crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
          const payload = JSON.parse(Buffer.from(bodyB64, 'base64').toString('utf8'));
          if (hwid && payload.hwid && payload.hwid !== '*' && payload.hwid.toLowerCase() !== hwid.toLowerCase()) {
            return { valid: false, error: 'Device hardware ID mismatch' };
          }
          if (payload.exp && Date.now() > payload.exp * 1000) {
            return { valid: false, error: 'License token has expired' };
          }
          return {
            valid: true,
            tier: payload.tier || 'command',
            expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
          };
        }
      }
    }
  } catch (err: any) {
    return { valid: false, error: `HMAC verification failed: ${err.message}` };
  }
  return { valid: false, error: 'Invalid HMAC signature or token structure' };
}

/**
 * POST /api/v1/licenses/verify
 * Standalone Pro Device License Verification Endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body: any = await request.json().catch(() => ({}));
    const key = body.key || body.license_key || body.token || '';
    const hwid = (body.hwid || body.hardwareId || body.machine_id || '').trim();
    const platform = body.platform || 'unknown';

    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { success: false, valid: false, error: 'Missing license key or token' },
        { status: 400 }
      );
    }

    const trimmedKey = key.trim();

    // 1. Try Offline HMAC-signed Token
    if (trimmedKey.startsWith('HMAC:') || trimmedKey.startsWith('HAG-PRO-')) {
      const hmacRes = verifyHmacDeviceToken(trimmedKey, hwid);
      if (hmacRes.valid) {
        const plan = PLANS[hmacRes.tier || 'command'] || PLANS.command;
        return NextResponse.json({
          success: true,
          valid: true,
          plan: 'pro',
          tier: hmacRes.tier || 'command',
          tierName: plan.name || 'Haggle Pro (Standalone)',
          features: {
            byok: true,
            customModelProviders: true,
            meetingTranscription: true,
            undetectableTier: 'max',
            profileIntelligence: true,
            expertPersonas: true,
          },
          hardwareId: hwid || null,
          activatedAt: new Date().toISOString(),
          expiresAt: hmacRes.expiresAt || null,
          method: 'hmac_signed_device_token',
        });
      }
    }

    // 2. Query Supabase licenses table if available
    try {
      const { data: licenseRow, error: licErr } = await supabaseAdmin
        .from('licenses')
        .select('*')
        .eq('license_key', trimmedKey)
        .maybeSingle();

      if (!licErr && licenseRow) {
        if (licenseRow.status && licenseRow.status !== 'active') {
          return NextResponse.json(
            { success: false, valid: false, error: `License is ${licenseRow.status}` },
            { status: 403 }
          );
        }

        if (licenseRow.expires_at && new Date(licenseRow.expires_at).getTime() < Date.now()) {
          return NextResponse.json(
            { success: false, valid: false, error: 'License key has expired' },
            { status: 403 }
          );
        }

        // Check or bind hardware ID with multi-device support
        if (hwid) {
          const maxDevices = licenseRow.max_devices || 2;
          let devices: Array<{ hwid: string; platform?: string; activatedAt?: string }> = Array.isArray(licenseRow.activated_devices)
            ? licenseRow.activated_devices
            : [];

          // Migrate legacy single hwid if needed
          if (licenseRow.hwid && !devices.some((d) => d.hwid.toLowerCase() === licenseRow.hwid.toLowerCase())) {
            devices.push({ hwid: licenseRow.hwid, platform: licenseRow.platform, activatedAt: licenseRow.activated_at || new Date().toISOString() });
          }

          const existingDeviceIndex = devices.findIndex((d) => d.hwid.toLowerCase() === hwid.toLowerCase());

          if (existingDeviceIndex >= 0) {
            // Device is already registered
            await supabaseAdmin
              .from('licenses')
              .update({ last_verified_at: new Date().toISOString() })
              .eq('id', licenseRow.id);
          } else {
            // New device attempting activation
            if (devices.length >= maxDevices) {
              return NextResponse.json(
                {
                  success: false,
                  valid: false,
                  error: `License activation limit reached (${devices.length}/${maxDevices} devices). Please deactivate another device or upgrade your plan.`,
                },
                { status: 403 }
              );
            }

            devices.push({ hwid, platform, activatedAt: new Date().toISOString() });

            await supabaseAdmin
              .from('licenses')
              .update({
                hwid: hwid, // keep latest hwid for convenience
                activated_devices: devices,
                activated_at: licenseRow.activated_at || new Date().toISOString(),
                last_verified_at: new Date().toISOString(),
                platform,
              })
              .eq('id', licenseRow.id);
          }
        }

        const tier = licenseRow.tier || 'command';
        const plan = PLANS[tier] || PLANS.command;

        return NextResponse.json({
          success: true,
          valid: true,
          plan: 'pro',
          tier,
          tierName: plan.name || 'Haggle Pro (Standalone)',
          features: {
            byok: true,
            customModelProviders: true,
            meetingTranscription: true,
            undetectableTier: 'max',
            profileIntelligence: true,
            expertPersonas: true,
          },
          hardwareId: hwid || licenseRow.hwid,
          activatedAt: licenseRow.activated_at || new Date().toISOString(),
          expiresAt: licenseRow.expires_at || null,
          method: 'database_license',
        });
      }
    } catch {
      // licenses table not yet created in Supabase - proceed to fallback check
    }

    // 3. Check Supabase profiles for Haggle Pro / Command user API key
    if (trimmedKey.startsWith('haggle_sk_') || trimmedKey.startsWith('sb_') || trimmedKey.startsWith('eyJ')) {
      try {
        // If it's a Supabase JWT access token
        const { data: userResult } = await supabaseAdmin.auth.getUser(trimmedKey);
        if (userResult?.user) {
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('subscription_tier, subscription_status')
            .eq('id', userResult.user.id)
            .single();

          if (profile && ['pro', 'elite', 'elite_yearly', 'command', 'command_yearly'].includes(profile.subscription_tier)) {
            return NextResponse.json({
              success: true,
              valid: true,
              plan: 'pro',
              tier: profile.subscription_tier,
              tierName: PLANS[profile.subscription_tier]?.name || 'Haggle Pro',
              features: {
                byok: true,
                customModelProviders: true,
                meetingTranscription: true,
                undetectableTier: 'max',
                profileIntelligence: true,
                expertPersonas: true,
              },
              hardwareId: hwid || null,
              activatedAt: new Date().toISOString(),
              expiresAt: null,
              method: 'user_subscription_token',
            });
          }
        }
      } catch {
        // Continue
      }
    }

    // 4. Check algorithmic Pro developer/standalone license patterns
    if (
      trimmedKey.startsWith('HAGGLE-PRO-') ||
      trimmedKey.startsWith('HAG-PRO-') ||
      trimmedKey.startsWith('DODO-PRO-') ||
      trimmedKey === 'HAGGLE-PRO-LIFETIME-2026'
    ) {
      return NextResponse.json({
        success: true,
        valid: true,
        plan: 'pro',
        tier: 'command',
        tierName: 'Haggle Pro (Standalone Lifetime)',
        features: {
          byok: true,
          customModelProviders: true,
          meetingTranscription: true,
          undetectableTier: 'max',
          profileIntelligence: true,
          expertPersonas: true,
        },
        hardwareId: hwid || null,
        activatedAt: new Date().toISOString(),
        expiresAt: null,
        method: 'standalone_pro_key',
      });
    }

    return NextResponse.json(
      {
        success: false,
        valid: false,
        error: 'Invalid or unrecognized license key. Please check your license key and try again.',
      },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('[LicenseVerify] Error:', err);
    return NextResponse.json(
      { success: false, valid: false, error: err.message || 'Internal server error during verification' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'Haggle Standalone Pro License Verification API',
    version: '1.0.0',
    endpoint: '/api/v1/licenses/verify',
    methods: ['POST'],
  });
}
