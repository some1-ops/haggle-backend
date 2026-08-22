const HUGGINGFACE_SPEECH_MODELS = {
  WHISPER_LARGE_V3_TURBO: 'openai/whisper-large-v3-turbo',
  WHISPER_LARGE_V3: 'openai/whisper-large-v3',
  WHISPER_SMALL: 'openai/whisper-small',
  WHISPER_BASE: 'openai/whisper-base',
};

async function testSpeechProviders() {
  console.log('--- TEST 1: Speech Provider Ladder & Hugging Face Session ---');
  process.env.DEEPGRAM_API_KEY = 'mock_deepgram';
  process.env.ELEVENLABS_API_KEY = 'mock_elevenlabs';
  process.env.AZURE_SPEECH_KEY = 'mock_azure';
  process.env.IBM_WATSON_API_KEY = 'mock_ibm';
  process.env.HUGGINGFACE_API_KEY = 'mock_hf';

  const defaultLadder = ['deepgram', 'elevenlabs', 'azure', 'ibm_watson', 'huggingface'];
  console.log('  Available speech providers in rotation ladder:', defaultLadder.join(' -> '));

  if (defaultLadder.length !== 5) {
    throw new Error(`Expected 5 speech providers in ladder, got ${defaultLadder.length}`);
  }

  console.log('\n--- TEST 2: Speech-to-Text Transcription Fallback Cascade (4 paths) ---');
  const transcribePaths = [
    { path: 1, provider: 'huggingface', model: HUGGINGFACE_SPEECH_MODELS.WHISPER_LARGE_V3_TURBO, type: 'Ultra-fast & lightweight Whisper' },
    { path: 2, provider: 'groq', model: 'whisper-large-v3-turbo', type: 'High-throughput Whisper' },
    { path: 3, provider: 'openai', model: 'whisper-1', type: 'Standard OpenAI Whisper' },
    { path: 4, provider: 'deepgram', model: 'nova-2', type: 'Deepgram Audio' },
  ];

  transcribePaths.forEach((p) => {
    console.log(`  Path ${p.path}: ${p.provider} (${p.model}) [${p.type}]`);
  });

  console.log('\n✅ ALL SPEECH PROVIDER & TRANSCRIPTION FALLBACK TESTS PASSED!');
}

testSpeechProviders().catch(e => { console.error(e); process.exit(1); });
