import { resolveUser } from '@/lib/auth';
import { executeDualSearch, executeDualExtract } from '@/lib/dual-search';

/**
 * GET /v1/search?q=query[&domains=example.com]
 * POST /v1/search { query: string, includeDomains?: string[], excludeDomains?: string[], fetchUrls?: string[], customTavilyKey?: string }
 *
 * Dual Search Pipeline:
 * TinyFish is the default primary search provider.
 * If TinyFish encounters any error, rate limit, or failure, it automatically fails over
 * to Tavily seamlessly without showing errors to the caller.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || url.searchParams.get('query');

  if (!query || !query.trim()) {
    return Response.json({ error: 'Missing required search query parameter "q"' }, { status: 400 });
  }

  const user = await resolveUser(request);
  if (!user) {
    return Response.json({ error: 'Missing or invalid Authorization bearer token' }, { status: 401 });
  }

  const includeDomains = url.searchParams.get('domains')?.split(',').map((d) => d.trim()).filter(Boolean);

  try {
    const searchRes = await executeDualSearch(query, { includeDomains });

    return Response.json(
      {
        query,
        results: searchRes.results,
        provider: searchRes.provider,
        fallbackOccurred: searchRes.fallbackOccurred,
        latencyMs: searchRes.latencyMs,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
          'x-search-provider': searchRes.provider,
          'x-fallback-occurred': String(searchRes.fallbackOccurred),
          'x-latency-ms': String(searchRes.latencyMs),
        },
      }
    );
  } catch (err: any) {
    console.error('[Search API] Dual search error:', err);
    return Response.json(
      { error: err.message || 'Search execution failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const user = await resolveUser(request, body.key || body.api_key || body.trial_token);
  if (!user) {
    return Response.json({ error: 'Missing or invalid Authorization bearer token' }, { status: 401 });
  }

  const query = body.query || body.q;
  const fetchUrls: string[] = Array.isArray(body.fetchUrls) ? body.fetchUrls : [];

  if (!query && fetchUrls.length === 0) {
    return Response.json({ error: 'Either "query" or "fetchUrls" must be provided' }, { status: 400 });
  }

  try {
    let searchRes = null;
    let extractRes = null;

    if (query) {
      searchRes = await executeDualSearch(query, {
        includeDomains: body.includeDomains,
        excludeDomains: body.excludeDomains,
        location: body.location,
        language: body.language,
        customTavilyKey: body.customTavilyKey || body.tavilyKey,
      });
    }

    if (fetchUrls.length > 0) {
      extractRes = await executeDualExtract(
        fetchUrls.slice(0, 5),
        body.customTavilyKey || body.tavilyKey
      );
    }

    const provider = searchRes?.provider || extractRes?.provider || 'tinyfish';
    const fallbackOccurred = Boolean(searchRes?.fallbackOccurred || extractRes?.fallbackOccurred);
    const latencyMs = searchRes?.latencyMs ?? 0;

    return Response.json(
      {
        query,
        results: searchRes?.results || [],
        fetched: extractRes?.data || null,
        provider,
        fallbackOccurred,
        latencyMs,
      },
      {
        headers: {
          'x-search-provider': provider,
          'x-fallback-occurred': String(fallbackOccurred),
          'x-latency-ms': String(latencyMs),
        },
      }
    );
  } catch (err: any) {
    console.error('[Search/Fetch API] Execution error:', err);
    return Response.json(
      { error: err.message || 'Search/Fetch execution failed' },
      { status: 500 }
    );
  }
}
