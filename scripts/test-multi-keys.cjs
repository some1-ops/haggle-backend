const keyHealthMap = new Map();

function maskApiKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function getProviderKeys(provider, customApiKey) {
  if (customApiKey) return [customApiKey.trim()];
  const norm = provider.toLowerCase().trim();
  const rawKeys = [];

  const addKeyString = (val) => {
    if (!val) return;
    const trimmed = val.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('your_') || trimmed.includes('_here') || trimmed === 'undefined' || trimmed === 'null') return;
    if (trimmed.includes(',') || trimmed.includes(';') || trimmed.includes('\n')) {
      const parts = trimmed.split(/[,;\n]/).map((p) => p.trim());
      for (const p of parts) {
        if (p && !p.startsWith('your_') && !p.includes('_here')) rawKeys.push(p);
      }
    } else {
      rawKeys.push(trimmed);
    }
  };

  const env = process.env;

  switch (norm) {
    case 'huggingface':
    case 'hf': {
      addKeyString(env.HUGGINGFACE_API_KEY);
      addKeyString(env.HUGGINGFACE_API_KEYS);
      addKeyString(env.HF_TOKEN);
      addKeyString(env.HF_TOKENS);
      addKeyString(env.HF_API_KEY);
      addKeyString(env.HF_API_KEYS);
      for (let i = 1; i <= 10; i++) {
        addKeyString(env[`HUGGINGFACE_API_KEY_${i}`]);
        addKeyString(env[`HF_TOKEN_${i}`]);
        addKeyString(env[`HF_API_KEY_${i}`]);
      }
      addKeyString(env.HUGGINGFACE_API_KEY_ALT);
      addKeyString(env.HUGGINGFACE_API_KEY_BACKUP);
      addKeyString(env.HUGGINGFACE_API_KEY_FALLBACK);
      addKeyString(env.HF_TOKEN_ALT);
      break;
    }
    case 'groq': {
      addKeyString(env.GROQ_API_KEY);
      addKeyString(env.GROQ_API_KEYS);
      for (let i = 1; i <= 10; i++) addKeyString(env[`GROQ_API_KEY_${i}`]);
      addKeyString(env.GROQ_API_KEY_ALT);
      addKeyString(env.GROQ_API_KEY_BACKUP);
      break;
    }
    case 'deepgram': {
      addKeyString(env.DEEPGRAM_API_KEY);
      addKeyString(env.DEEPGRAM_API_KEYS);
      for (let i = 1; i <= 10; i++) addKeyString(env[`DEEPGRAM_API_KEY_${i}`]);
      addKeyString(env.DEEPGRAM_API_KEY_ALT);
      break;
    }
  }

  const uniqueKeys = [];
  for (const k of rawKeys) {
    if (!uniqueKeys.includes(k)) uniqueKeys.push(k);
  }
  return uniqueKeys;
}

function markKeyCooldown(key, cooldownSeconds = 60) {
  const now = Date.now();
  keyHealthMap.set(key, { cooldownUntil: now + cooldownSeconds * 1000 });
}

function isKeyInCooldown(key) {
  const state = keyHealthMap.get(key);
  if (!state || !state.cooldownUntil) return false;
  return Date.now() < state.cooldownUntil;
}

function prioritizeHealthyKeys(keys) {
  if (keys.length <= 1) return keys;
  const healthy = [];
  const cooling = [];
  for (const k of keys) {
    if (isKeyInCooldown(k)) cooling.push(k);
    else healthy.push(k);
  }
  return [...healthy, ...cooling];
}

async function runTests() {
  console.log('--- TEST 1: Multi-Key Extraction & Normalization ---');
  process.env.HUGGINGFACE_API_KEY = 'hf_alpha1111, hf_beta2222, hf_gamma3333';
  process.env.HUGGINGFACE_API_KEY_2 = 'hf_delta4444';
  process.env.HF_TOKEN_ALT = 'hf_epsilon5555';

  const hfKeys = getProviderKeys('huggingface');
  console.log('  Extracted HF Keys count:', hfKeys.length);
  console.log('  Masked keys:', hfKeys.map(maskApiKey).join(', '));
  if (hfKeys.length !== 5) throw new Error(`Expected 5 keys, got ${hfKeys.length}`);
  console.log('  ✓ Comma-separated, indexed, and alias keys successfully merged and deduplicated!');

  console.log('\n--- TEST 2: Multi-Key Health Prioritization on 429 ---');
  markKeyCooldown(hfKeys[0], 60);
  const prioritized = prioritizeHealthyKeys(hfKeys);
  console.log('  Prioritized keys after key 1 cooldown:', prioritized.map(maskApiKey).join(' -> '));
  if (prioritized[0] === hfKeys[0]) throw new Error('Expected cooled key to be rotated behind healthy keys');
  console.log('  ✓ Rate-limited / cooled keys automatically rotated behind healthy alternative keys!');

  console.log('\n--- TEST 3: Multi-Key Switching Simulation ---');
  let attempt = 0;
  const triedKeys = [];

  const simulateCall = async (keys) => {
    for (const key of keys) {
      attempt++;
      triedKeys.push(maskApiKey(key));
      if (attempt === 1) {
        markKeyCooldown(key, 60);
        console.log(`  Attempt 1: Key ${maskApiKey(key)} hit 429 Rate Limit. Rotating to next key...`);
        continue;
      }
      return { success: true, text: 'Hello from alternative key!', keyUsed: maskApiKey(key) };
    }
    throw new Error('All keys failed');
  };

  const res = await simulateCall(prioritized);
  console.log('  Result:', res);
  if (attempt !== 2) throw new Error('Expected 2 attempts for key rotation');
  console.log('  ✓ Successfully switched from rate-limited key to alternative key without halting!');

  console.log('\n✅ ALL MULTI-KEY ROTATION & SWITCHING TESTS PASSED!');
}

runTests().catch(e => { console.error(e); process.exit(1); });
