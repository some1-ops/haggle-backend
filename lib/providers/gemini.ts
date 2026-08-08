export async function callGemini(messages: { role: string; content: string }[], model: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured on backend');

  const modelName = model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemInstruction = messages.find((m) => m.role === 'system')?.content;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents,
      ...(systemInstruction
        ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
        : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return { text, raw: data };
}
