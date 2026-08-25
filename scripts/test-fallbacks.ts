import {
  resolveHuggingFaceModel,
  HUGGINGFACE_MODELS,
  buildFallbackLadder,
  hasProviderKey,
  getActiveAIProviders,
  callChatWithFallback,
} from '../lib/providers';

async function runTests() {
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
      console.log(`  ✓ Alias "${t.input}" correctly resolved to ${resolved}`);
    } else {
      throw new Error(`Alias test failed for ${t.input}: got ${resolved}, expected ${t.expected}`);
    }
  }

  console.log('\n--- TEST 2: Fallback Ladder Generation (Fast Mode) ---');
  // Temporarily mock environment keys for test
  process.env.GROQ_API_KEY = 'mock_groq_key';
  process.env.HUGGINGFACE_API_KEY = 'mock_hf_key';
  process.env.GEMINI_API_KEY = 'mock_gemini_key';
  process.env.OPENAI_API_KEY = 'mock_openai_key';

  const fastLadder = buildFallbackLadder({
    messages: [{ role: 'user', content: 'test' }],
    fastMode: true,
  });

  console.log('  Fast Mode Ladder paths:');
  fastLadder.forEach((step, idx) => {
    console.log(`    Path ${idx + 1}: ${step.provider} (${step.model}) - ${step.label}`);
  });

  if (fastLadder.length < 3) {
    throw new Error(`Expected at least 3 fallback paths for fast mode, got ${fastLadder.length}`);
  }
  console.log(`  ✓ Fast mode configured with ${fastLadder.length} fallback paths`);

  console.log('\n--- TEST 3: Fallback Ladder for Hugging Face Primary ---');
  const hfLadder = buildFallbackLadder({
    messages: [{ role: 'user', content: 'test' }],
    provider: 'huggingface',
    model: 'llama-3.3-70b',
  });

  console.log('  Hugging Face Primary Ladder:');
  hfLadder.forEach((step, idx) => {
    console.log(`    Path ${idx + 1}: ${step.provider} (${step.model}) - ${step.label}`);
  });

  if (hfLadder[0].provider !== 'huggingface') {
    throw new Error(`Expected Path 1 to be huggingface, got ${hfLadder[0].provider}`);
  }
  if (hfLadder.length < 3) {
    throw new Error(`Expected at least 3 fallback paths for Hugging Face, got ${hfLadder.length}`);
  }
  console.log(`  ✓ Hugging Face primary configured with ${hfLadder.length} fallback paths`);

  console.log('\n--- TEST 4: Fallback Execution Simulation ---');
  // Mock global fetch to simulate Path 1 failing with 429 Rate Limit and Path 2 succeeding
  const originalFetch = global.fetch;
  let callCount = 0;

  global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    callCount++;
    const urlStr = url.toString();

    // First call (Groq) simulates 429 Too Many Requests (Rate Limit)
    if (callCount === 1) {
      return new Response(JSON.stringify({ error: { message: 'Rate limit reached: 429 Too Many Requests' } }), {
        status: 429,
        statusText: 'Too Many Requests',
      });
    }

    // Second call (Hugging Face) simulates 200 OK
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello! I am Hugging Face Llama 3.2 3B responding successfully via fallback.',
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as any;

  try {
    const result = await callChatWithFallback({
      messages: [{ role: 'user', content: 'hello' }],
      fastMode: true,
    });

    console.log('  Fallback Result:', {
      provider: result.provider,
      model: result.model,
      fallbackOccurred: result.fallbackOccurred,
      attemptsCount: result.attempts.length,
      firstAttemptSuccess: result.attempts[0]?.success,
      firstAttemptError: result.attempts[0]?.error,
      secondAttemptSuccess: result.attempts[1]?.success,
    });

    if (!result.fallbackOccurred) {
      throw new Error('Expected fallbackOccurred to be true after Path 1 rate limit');
    }
    if (result.attempts[0].success !== false) {
      throw new Error('Expected attempt 1 to fail');
    }
    if (result.attempts[1].success !== true) {
      throw new Error('Expected attempt 2 to succeed');
    }

    console.log('  ✓ Multi-path fallback cascade seamlessly handled 429 rate limit and switched to next path without error!');
  } finally {
    global.fetch = originalFetch;
  }

  console.log('\n✅ ALL FALLBACK & HUGGING FACE TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
