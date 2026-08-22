/**
 * Multi-Key Pool Manager
 *
 * Supports multiple API keys per provider through various naming conventions:
 * 1. Comma/semicolon/newline separated in a single variable:
 *    HUGGINGFACE_API_KEY="hf_key1,hf_key2,hf_key3"
 *    HUGGINGFACE_API_KEYS="hf_key1,hf_key2"
 * 2. Numbered / index suffixed variables:
 *    HUGGINGFACE_API_KEY=hf_key1
 *    HUGGINGFACE_API_KEY_1=hf_key1
 *    HUGGINGFACE_API_KEY_2=hf_key2
 *    HUGGINGFACE_API_KEY_3=hf_key3
 * 3. Descriptive suffix variables:
 *    HUGGINGFACE_API_KEY_ALT=hf_key2
 *    HUGGINGFACE_API_KEY_BACKUP=hf_key3
 *    HUGGINGFACE_API_KEY_FALLBACK=hf_key4
 * 4. Provider-specific alias tokens (e.g. HF_TOKEN, HF_TOKEN_2, HF_API_KEY, etc.)
 */

export type AIOrSpeechProvider =
  | 'huggingface'
  | 'hf'
  | 'groq'
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'deepgram'
  | 'elevenlabs'
  | 'azure'
  | 'ibm_watson';

interface KeyHealthState {
  keyMask: string;
  failureCount: number;
  lastFailureAt: number | null;
  cooldownUntil: number | null;
}

// Track health and cooldowns across active keys
const keyHealthMap = new Map<string, KeyHealthState>();

// Mask key for safe logging (e.g. "hf_12...9f")
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Extracts and normalizes an array of keys for a given provider from environment variables.
 */
export function getProviderKeys(provider: string, customApiKey?: string): string[] {
  if (customApiKey) {
    return [customApiKey.trim()];
  }

  const norm = provider.toLowerCase().trim();
  const rawKeys: string[] = [];

  const addKeyString = (val?: string) => {
    if (!val) return;
    const trimmed = val.trim();
    if (!trimmed) return;
    // Ignore placeholder values
    if (
      trimmed.startsWith('your_') ||
      trimmed.includes('_here') ||
      trimmed === 'undefined' ||
      trimmed === 'null'
    ) {
      return;
    }
    // If comma, semicolon, or newline separated list
    if (trimmed.includes(',') || trimmed.includes(';') || trimmed.includes('\n')) {
      const parts = trimmed.split(/[,;\n]/).map((p) => p.trim());
      for (const p of parts) {
        if (p && !p.startsWith('your_') && !p.includes('_here')) {
          rawKeys.push(p);
        }
      }
    } else {
      rawKeys.push(trimmed);
    }
  };

  const env = process.env;

  switch (norm) {
    case 'huggingface':
    case 'hf': {
      // Main & Plural
      addKeyString(env.HUGGINGFACE_API_KEY);
      addKeyString(env.HUGGINGFACE_API_KEYS);
      addKeyString(env.HF_TOKEN);
      addKeyString(env.HF_TOKENS);
      addKeyString(env.HF_API_KEY);
      addKeyString(env.HF_API_KEYS);

      // Indexed 1..10
      for (let i = 1; i <= 10; i++) {
        addKeyString(env[`HUGGINGFACE_API_KEY_${i}`]);
        addKeyString(env[`HF_TOKEN_${i}`]);
        addKeyString(env[`HF_API_KEY_${i}`]);
      }

      // Suffixes
      addKeyString(env.HUGGINGFACE_API_KEY_ALT);
      addKeyString(env.HUGGINGFACE_API_KEY_BACKUP);
      addKeyString(env.HUGGINGFACE_API_KEY_FALLBACK);
      addKeyString(env.HF_TOKEN_ALT);
      addKeyString(env.HF_TOKEN_BACKUP);
      break;
    }

    case 'groq': {
      addKeyString(env.GROQ_API_KEY);
      addKeyString(env.GROQ_API_KEYS);
      for (let i = 1; i <= 10; i++) {
        addKeyString(env[`GROQ_API_KEY_${i}`]);
      }
      addKeyString(env.GROQ_API_KEY_ALT);
      addKeyString(env.GROQ_API_KEY_BACKUP);
      addKeyString(env.GROQ_API_KEY_FALLBACK);
      break;
    }

    case 'gemini': {
      addKeyString(env.GEMINI_API_KEY);
      addKeyString(env.GEMINI_API_KEYS);
      addKeyString(env.GOOGLE_API_KEY);
      for (let i = 1; i <= 10; i++) {
        addKeyString(env[`GEMINI_API_KEY_${i}`]);
        addKeyString(env[`GOOGLE_API_KEY_${i}`]);
      }
      addKeyString(env.GEMINI_API_KEY_ALT);
      addKeyString(env.GEMINI_API_KEY_BACKUP);
      break;
    }

    case 'openai': {
      addKeyString(env.OPENAI_API_KEY);
      addKeyString(env.OPENAI_API_KEYS);
      for (let i = 1; i <= 10; i++) {
        addKeyString(env[`OPENAI_API_KEY_${i}`]);
      }
      addKeyString(env.OPENAI_API_KEY_ALT);
      addKeyString(env.OPENAI_API_KEY_BACKUP);
      break;
    }

    case 'anthropic': {
      addKeyString(env.ANTHROPIC_API_KEY);
      addKeyString(env.ANTHROPIC_API_KEYS);
      for (let i = 1; i <= 10; i++) {
        addKeyString(env[`ANTHROPIC_API_KEY_${i}`]);
      }
      addKeyString(env.ANTHROPIC_API_KEY_ALT);
      addKeyString(env.ANTHROPIC_API_KEY_BACKUP);
      break;
    }

    case 'deepgram': {
      addKeyString(env.DEEPGRAM_API_KEY);
      addKeyString(env.DEEPGRAM_API_KEYS);
      for (let i = 1; i <= 10; i++) {
        addKeyString(env[`DEEPGRAM_API_KEY_${i}`]);
      }
      addKeyString(env.DEEPGRAM_API_KEY_ALT);
      addKeyString(env.DEEPGRAM_API_KEY_BACKUP);
      break;
    }

    case 'elevenlabs': {
      addKeyString(env.ELEVENLABS_API_KEY);
      addKeyString(env.ELEVENLABS_API_KEYS);
      for (let i = 1; i <= 10; i++) {
        addKeyString(env[`ELEVENLABS_API_KEY_${i}`]);
      }
      addKeyString(env.ELEVENLABS_API_KEY_ALT);
      addKeyString(env.ELEVENLABS_API_KEY_BACKUP);
      break;
    }

    case 'azure': {
      addKeyString(env.AZURE_SPEECH_KEY);
      addKeyString(env.AZURE_SPEECH_KEYS);
      for (let i = 1; i <= 10; i++) {
        addKeyString(env[`AZURE_SPEECH_KEY_${i}`]);
      }
      addKeyString(env.AZURE_SPEECH_KEY_ALT);
      addKeyString(env.AZURE_SPEECH_KEY_BACKUP);
      break;
    }

    case 'ibm_watson': {
      addKeyString(env.IBM_WATSON_API_KEY);
      addKeyString(env.IBM_WATSON_KEYS);
      for (let i = 1; i <= 10; i++) {
        addKeyString(env[`IBM_WATSON_API_KEY_${i}`]);
      }
      addKeyString(env.IBM_WATSON_API_KEY_ALT);
      addKeyString(env.IBM_WATSON_API_KEY_BACKUP);
      break;
    }
  }

  // Deduplicate while preserving order
  const uniqueKeys: string[] = [];
  for (const k of rawKeys) {
    if (!uniqueKeys.includes(k)) {
      uniqueKeys.push(k);
    }
  }

  return uniqueKeys;
}

/**
 * Checks if at least one valid key exists for a provider.
 */
export function hasProviderKeys(provider: string, customApiKey?: string): boolean {
  if (customApiKey) return true;
  return getProviderKeys(provider).length > 0;
}

/**
 * Returns primary key for a provider, or null if none configured.
 */
export function getPrimaryProviderKey(provider: string, customApiKey?: string): string | null {
  const keys = getProviderKeys(provider, customApiKey);
  return keys[0] || null;
}

/**
 * Marks a key as temporarily failed with cooldown (e.g. rate limited 429).
 */
export function markKeyCooldown(key: string, cooldownSeconds: number = 60) {
  const mask = maskApiKey(key);
  const now = Date.now();
  const existing = keyHealthMap.get(key) || {
    keyMask: mask,
    failureCount: 0,
    lastFailureAt: null,
    cooldownUntil: null,
  };

  existing.failureCount += 1;
  existing.lastFailureAt = now;
  existing.cooldownUntil = now + cooldownSeconds * 1000;
  keyHealthMap.set(key, existing);
}

/**
 * Returns true if a key is currently on cooldown.
 */
export function isKeyInCooldown(key: string): boolean {
  const state = keyHealthMap.get(key);
  if (!state || !state.cooldownUntil) return false;
  return Date.now() < state.cooldownUntil;
}

/**
 * Reorders a key list so non-cooldown keys are tried first.
 */
export function prioritizeHealthyKeys(keys: string[]): string[] {
  if (keys.length <= 1) return keys;
  const healthy: string[] = [];
  const cooling: string[] = [];

  for (const k of keys) {
    if (isKeyInCooldown(k)) {
      cooling.push(k);
    } else {
      healthy.push(k);
    }
  }

  return [...healthy, ...cooling];
}
