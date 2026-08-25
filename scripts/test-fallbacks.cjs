const HUGGINGFACE_MODELS = {
  LLAMA_3_3_70B: 'meta-llama/Llama-3.3-70B-Instruct',
  LLAMA_3_1_8B: 'meta-llama/Llama-3.1-8B-Instruct',
  QWEN_2_5_72B: 'Qwen/Qwen2.5-72B-Instruct',
  DEEPSEEK_R1: 'deepseek-ai/DeepSeek-R1',
};

const DEFAULT_HF_CHAT_MODEL = HUGGINGFACE_MODELS.LLAMA_3_3_70B;

function resolveHuggingFaceModel(model) {
  if (!model) return DEFAULT_HF_CHAT_MODEL;
  const m = model.toLowerCase().trim();
  const aliasMap = {
    'llama-3.3-70b': HUGGINGFACE_MODELS.LLAMA_3_3_70B,
    'llama-3.3-70b-instruct': HUGGINGFACE_MODELS.LLAMA_3_3_70B,
    'llama-3.3': HUGGINGFACE_MODELS.LLAMA_3_3_70B,
    'llama-3.1-8b': HUGGINGFACE_MODELS.LLAMA_3_1_8B,
    'llama-3.1-8b-instruct': HUGGINGFACE_MODELS.LLAMA_3_1_8B,
    'llama-3.1': HUGGINGFACE_MODELS.LLAMA_3_1_8B,
    'llama': HUGGINGFACE_MODELS.LLAMA_3_3_70B,
    'qwen-2.5-72b': HUGGINGFACE_MODELS.QWEN_2_5_72B,
    'qwen-2.5-72b-instruct': HUGGINGFACE_MODELS.QWEN_2_5_72B,
    'qwen': HUGGINGFACE_MODELS.QWEN_2_5_72B,
    'deepseek-r1': HUGGINGFACE_MODELS.DEEPSEEK_R1,
    'fast': HUGGINGFACE_MODELS.LLAMA_3_1_8B,
    'lightweight': HUGGINGFACE_MODELS.LLAMA_3_1_8B,
    'quality': HUGGINGFACE_MODELS.LLAMA_3_3_70B,
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
          normModel = 'groq/compound';
          break;
        case 'huggingface':
          normModel = HUGGINGFACE_MODELS.LLAMA_3_3_70B;
          break;
        case 'gemini':
          normModel = 'gemini-3.6-flash';
          break;
        case 'openai':
          normModel = fastMode ? 'gpt-4o-mini' : 'gpt-5.4';
          break;
        case 'anthropic':
          normModel = 'claude-sonnet-4-6';
          break;
      }
    } else if (normProvider === 'huggingface') {
      normModel = resolveHuggingFaceModel(normModel);
    }

    candidates.push({ provider: normProvider, model: normModel, label: `Primary (${normProvider})` });
  }

  if (fastMode) {
    const fastLadder = [
      { provider: 'groq', model: 'groq/compound', label: 'Fast Path 1 (Groq Compound)' },
      { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_1_8B, label: 'Fast Path 2 (HF Llama 3.1 8B)' },
      { provider: 'groq', model: 'openai/gpt-oss-120b', label: 'Fast Path 3 (Groq GPT-OSS 120B)' },
      { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_3_70B, label: 'Fast Path 4 (HF Llama 3.3 70B)' },
      { provider: 'gemini', model: 'gemini-3.6-flash', label: 'Fast Path 5 (Gemini 3.6 Flash)' },
      { provider: 'openai', model: 'gpt-4o-mini', label: 'Fast Path 6 (OpenAI 4o-mini)' },
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
        { provider: 'groq', model: 'groq/compound', label: 'Fallback 1 (Groq Compound)' },
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_1_8B, label: 'Fallback 2 (HF Llama 3.1 8B)' },
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.QWEN_2_5_72B, label: 'Fallback 3 (HF Qwen 2.5 72B)' },
        { provider: 'gemini', model: 'gemini-3.6-flash', label: 'Fallback 4 (Gemini 3.6 Flash)' },
        { provider: 'openai', model: 'gpt-5.4', label: 'Fallback 5 (OpenAI GPT-5.4)' },
      ];
      for (const c of hfFallbacks) {
        if (!candidates.some((existing) => existing.provider === c.provider && existing.model === c.model)) {
          candidates.push(c);
        }
      }
    } else {
      const defaultLadder = [
        { provider: 'groq', model: 'groq/compound', label: 'Default Path 1 (Groq Compound)' },
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_3_70B, label: 'Default Path 2 (HF Llama 3.3 70B)' },
        { provider: 'groq', model: 'openai/gpt-oss-120b', label: 'Default Path 3 (Groq GPT-OSS 120B)' },
        { provider: 'gemini', model: 'gemini-3.6-flash', label: 'Default Path 4 (Gemini 3.6 Flash)' },
        { provider: 'huggingface', model: HUGGINGFACE_MODELS.LLAMA_3_1_8B, label: 'Default Path 5 (HF Llama 3.1 8B)' },
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
    { input: 'llama-3.3-70b', expected: HUGGINGFACE_MODELS.LLAMA_3_3_70B },
    { input: 'llama-3.1-8b', expected: HUGGINGFACE_MODELS.LLAMA_3_1_8B },
    { input: 'qwen-2.5-72b', expected: HUGGINGFACE_MODELS.QWEN_2_5_72B },
    { input: 'deepseek-r1', expected: HUGGINGFACE_MODELS.DEEPSEEK_R1 },
    { input: 'fast', expected: HUGGINGFACE_MODELS.LLAMA_3_1_8B },
    { input: 'quality', expected: HUGGINGFACE_MODELS.LLAMA_3_3_70B },
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

  const hfLadder = buildFallbackLadder({ messages: [{ role: 'user', content: 'test' }], provider: 'huggingface', model: 'llama-3.3-70b' });
  console.log(`\n  Hugging Face Primary (${hfLadder.length} paths):`);
  hfLadder.forEach((p, i) => console.log(`    Path ${i + 1}: ${p.provider} (${p.model}) [${p.label}]`));
  if (hfLadder.length < 3) throw new Error('Expected at least 3 fallback paths for HF primary');

  const standardLadder = buildFallbackLadder({ messages: [{ role: 'user', content: 'test' }] });
  console.log(`\n  Standard Quality Mode (${standardLadder.length} paths):`);
  standardLadder.forEach((p, i) => console.log(`    Path ${i + 1}: ${p.provider} (${p.model}) [${p.label}]`));
  if (standardLadder.length < 3) throw new Error('Expected at least 3 fallback paths for standard mode');

  console.log('\n✅ ALL FALLBACK LADDERS & HUGGING FACE TESTS PASSED!');
}

testAll().catch(e => {
  console.error(e);
  process.exit(1);
});
