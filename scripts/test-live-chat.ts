import { resolveUser } from '../lib/auth';
import { callChatWithFallback } from '../lib/providers';

async function main() {
  console.log('=== TEST 1: Auth & Free/Trial Plan Verification ===');
  const req = new Request('https://api.algeris.com/v1/chat', {
    headers: { 'x-trial-token': 'haggle_trial_e2etesttoken.123456' }
  });
  const user = await resolveUser(req);
  console.log('Resolved user:', user ? {
    id: user.id,
    tierId: user.tierId,
    planName: user.plan.name,
    creditsPerMonth: user.plan.creditsPerMonth,
    availableCredits: user.availableCredits
  } : 'FAILED');

  if (!user || user.availableCredits !== 3 || user.plan.creditsPerMonth !== 3) {
    throw new Error('Trial/free credits mismatch: expected 3');
  }

  console.log('\n=== TEST 2: Live Chat Generation with Fallbacks ===');
  const chatRes = await callChatWithFallback({
    messages: [{ role: 'user', content: 'Say SUCCESS in one word' }],
    fastMode: true
  });
  console.log('Live chat output:', {
    provider: chatRes.provider,
    model: chatRes.model,
    text: chatRes.text.trim(),
    keyUsed: chatRes.keyUsed
  });

  if (!chatRes.text) {
    throw new Error('Chat response text was empty');
  }

  console.log('\n✅ ALL LIVE TESTS PASSED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
