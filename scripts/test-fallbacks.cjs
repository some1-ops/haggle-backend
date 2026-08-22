const HUGGINGFACE_MODELS = {
  LLAMA_3_2_3B: 'meta-llama/Llama-3.2-3B-Instruct',
  LLAMA_3_2_1B: 'meta-llama/Llama-3.2-1B-Instruct',
  QWEN_2_5_7B: 'Qwen/Qwen2.5-7B-Instruct',
  GEMMA_2_2B: 'google/gemma-2-2b-it',
  PHI_3_5_MINI: 'microsoft/Phi-3.5-mini-instruct',
  LLAMA_3_1_8B: 'meta-llama/Llama-3.1-8B-Instruct',
  MISTRAL_7B: 'mistralai/Mistral-7B-Instruct-v0.3',
  GEMMA_2_9B: 'google/gemma-2-9b-it',
  QWEN_2_5_72B: 'Qwen/Qwen2.5-72B-Instruct',
};

const DEFAULT_HF_CHAT_MODEL = HUGGINGFACE_MODELS.LLAMA_3_2_3B;

function resolveHuggingFaceModel(model) {
  if (!model) return DEFAULT_HF_CHAT_MODEL;
  const m = model.toLowerCase().trim();
  const aliasMap = {
    'llama-3.2-3b': HUGGINGFACE_MODELS.LLAMA_3_2_3B,
    'llama-3.2-3b-instruct': HUGGINGFACE_MODELS.LLAMA_3_2_3B,
    'llama-3.2-1b': HUGGINGFACE_MODELS.LLAMA_3_2_1B,
    'llama-3.2-1b-instruct': HUGGINGFACE_MODELS.LLAMA_3_2_1B,
    'llama-3.1-8b': HUGGINGFACE_MODELS.LLAMA_3_1_8B,
    'llama-3.1-8b-instruct': HUGGINGFACE_MODELS.LLAMA_3_1_8B,
    'qwen-2.5-7b': HUGGINGFACE_MODELS.QWEN_2_5_7B,
    'qwen-2.5-7b-instruct': HUGGINGFACE_MODELS.QWEN_2_5_7B,
    'qwen-7b': HUGGINGFACE_MODELS.QWEN_2_5_7B,
    'qwen-2.5-72b': HUGGINGFACE_MODELS.QWEN_2_5_72B,
    'mistral-7b': HUGGINGFACE_MODELS.MISTRAL_7B,
    'gemma-2-2b': HUGGINGFACE_MODELS.GEMMA_2_2B,
    'gemma-2-9b': HUGGINGFACE_MODELS.GEMMA_2_9B,
    'phi-3.5-mini': HUGGINGFACE_MODELS.PHI_3_5_MINI,
    'phi-3.5': HUGGINGFACE_MODELS.PHI_3_5_MINI,
    'fast': HUGGINGFACE_MODELS.LLAMA_3_2_3B,
    'lightweight': HUGGINGFACE_MODELS.LLAMA_3_2_1B,
  };
  return aliasMap[m] || model;
}

function hasProviderKey(provider, customApiKey) {
  if (customApiKey) return true;
  switch (provider.toLowerCase()) {
    case 'groq':
      return Boolean(process.env.GROQ_API_KEY);
    case 'gemini':
      return Boolean(process.env.GEMINI_API_KEY);
    case 'huggingface':
    case 'hf':
      return Boolean(process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || process.env.HF_API_KEY);
    case 'openai':
      return Boolean(process.env.OPENAI_API_KEY);
    case 'anthropic':
      return Boolean(process.env.ANTHROPIC_API_KEY);
    default:
      return false;
  }
}

function buildFallbackLadder(options) {
  const { provider, model, fastMode, customApiKey } = options;
  const candidates = [];

  if (provider) {
    const normProvider = (provider === 'hf' ? 'huggingface' : provider).toLowerCase();
    let normModel = model || '';

    if (!normModel) {
      switch (normProvider) {
        case 'groq':
          normModel = 'llama-3.3-70b-versatile';
          break;
        case 'huggingface':
          normModel = HUGGINGFACE_MODELS.LLAMA_3_2_3B;
          break;
        case 'gemini':
          normModel = 'gemini-2.0-flash';
          break;
        case 'openai':
          normModel = fastMode ? 'gpt-4o-mini' : 'gpt-4o';
          break;
        case 'anthropic':
          normModel = 'claude-3-5-sonnet-latest';
          break;
      }
    } else if (normProvider === 'huggingface') {
      normModel = resolveHuggingFaceModel(normModel);
    }

    candidates.push({ provider: normProvider, model: normModel, label: `Primary (${normProvider})` });
  }

  if (fastMode) {
    const fastLadder = [
      { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Fast Path 1 (Groq Llama 3.3)' },
      { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_2_3B, label: 'Fast Path 2 (HF Llama 3.2 3B)' },
      { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Fast Path 3 (Gemini 2.0 Flash)' },
      { provider: 'huggingface', model: HUGGINGFACE_MODELS.QWEN_2_5_7B, label: 'Fast Path 4 (HF Qwen 2.5 7B)' },
      { provider: 'openai', model: 'gpt-4o-mini', label: 'Fast Path 5 (OpenAI 4o-mini)' },
      { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_2_1B, label: 'Fast Path 6 (HF Llama 3.2 1B)' },
    ];

    for (const c of fastLadder) {
      if (!candidates.some((existing) => existing.provider === c.provider && existing.model === c.model)) {
        candidates.push(c);
      }
    }
  } else {
    const primary = provider?.toLowerCase();
    if (primary === 'huggingface' || primary === 'hf') {
      const hfFallbacks = [
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.QWEN_2_5_7B, label: 'HF Fallback (Qwen 2.5 7B)' },
        { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Fallback 1 (Groq Llama 3.3)' },
        { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Fallback 2 (Gemini 2.0 Flash)' },
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_1_8B, label: 'Fallback 3 (HF Llama 3.1 8B)' },
        { provider: 'openai', model: 'gpt-4o-mini', label: 'Fallback 4 (OpenAI 4o-mini)' },
      ];
      for (const c of hfFallbacks) {
        if (!candidates.some((existing) => existing.provider === c.provider && existing.model === c.model)) {
          candidates.push(c);
        }
      }
    } else {
      const defaultLadder = [
        { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Default Path 1 (Gemini 2.0 Flash)' },
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_2_3B, label: 'Default Path 2 (HF Llama 3.2 3B)' },
        { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Default Path 3 (Groq Llama 3.3)' },
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.QWEN_2_5_7B, label: 'Default Path 4 (HF Qwen 2.5 7B)' },
        { provider: 'openai', model: 'gpt-4o-mini', label: 'Default Path 5 (OpenAI 4o-mini)' },
      ];
      for (const c of defaultLadder) {
        if (!candidates.some((existing) => existing.provider === c.provider && existing.model === c.model)) {
          candidates.push(c);
        }
      }
    }
  }

  const activeCandidates = candidates.filter((c, idx) => {
    if (idx === 0 && customApiKey) return true;
    return hasProviderKey(c.provider);
  });

  return activeCandidates.length > 0 ? activeCandidates : candidates.slice(0, 3);
}

async function testAll() {
  console.log('--- TEST 1: Hugging Face Model Alias Resolution ---');
  const aliasTests = [
    { input: 'llama-3.2-3b', expected: HUGGINGFACE_MODELS.LLAMA_3_2_3B },
    { input: 'llama-3.2-1b', expected: HUGGINGFACE_MODELS.LLAMA_3_2_1B },
    { input: 'qwen-2.5-7b', expected: HUGGINGFACE_MODELS.QWEN_2_5_7B },
    { input: 'llama-3.1-8b', expected: HUGGINGFACE_MODELS.LLAMA_3_1_8B },
    { input: 'mistral-7b', expected: HUGGINGFACE_MODELS.MISTRAL_7B },
    { input: 'gemma-2-9b', expected: HUGGINGFACE_MODELS.GEMMA_2_9B },
    { input: 'phi-3.5-mini', expected: HUGGINGFACE_MODELS.PHI_3_5_MINI },
    { input: 'fast', expected: HUGGINGFACE_MODELS.LLAMA_3_2_3B },
  ];

  for (const t of aliasTests) {
    const resolved = resolveHuggingFaceModel(t.input);
    if (resolved === t.expected) {
      console.log(`  ✓ Alias "${t.input}" -> "${resolved}"`);
    } else {
      throw new Error(`Alias failed for ${t.input}: got ${resolved}, expected ${t.expected}`);
    }
  }

  console.log('\n--- TEST 2: Multi-Path Fallback Ladders (2-3+ Paths per mode) ---');
  process.env.GROQ_API_KEY = 'gsk_mock';
  process.env.HUGGINGFACE_API_KEY = 'hf_mock';
  process.env.GEMINI_API_KEY = 'gemini_mock';
  process.env.OPENAI_API_KEY = 'openai_mock';

  const fastLadder = buildFallbackLadder({ messages: [{ role: 'user', content: 'test' }], fastMode: true });
  console.log(`  Fast Mode (${fastLadder.length} paths):`);
  fastLadder.forEach((p, i) => console.log(`    Path ${i + 1}: ${p.provider} (${p.model}) [${p.label}]`));
  if (fastLadder.length < 3) throw new Error('Expected at least 3 fallback paths for fast mode');

  const hfLadder = buildFallbackLadder({ messages: [{ role: 'user', content: 'test' }], provider: 'huggingface', model: 'llama-3.2-3b' });
  console.log(`\n  Hugging Face Primary (${hfLadder.length} paths):`);
  hfLadder.forEach((p, i) => console.log(`    Path ${i + 1}: ${p.provider} (${p.model}) [${p.label}]`));
  if (hfLadder.length < 3) throw new Error('Expected at least 3 fallback paths for HF primary');

  const standardLadder = buildFallbackLadder({ messages: [{ role: 'user', content: 'test' }] });
  console.log(`\n  Standard Quality Mode (${standardLadder.length} paths):`);
  standardLadder.forEach((p, i) => console.log(`    Path ${i + 1}: ${p.provider} (${p.model}) [${p.label}]`));
  if (standardLadder.length < 3) throw new Error('Expected at least 3 fallback paths for standard mode');

  console.log('\n✅ ALL FALLBACK LADDERS & HUGGING FACE TESTS PASSED!');
}

testAll().catch(e => { console.error(e); process.exit(1); });
