import { tavily, type TavilyClient } from '@tavily/core';

let tavilyInstance: TavilyClient | null = null;

export function getTavilyClient(customApiKey?: string): TavilyClient | null {
  const apiKey = customApiKey || process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

  if (customApiKey) {
    return tavily({ apiKey: customApiKey });
  }

  if (!tavilyInstance) {
    tavilyInstance = tavily({ apiKey });
  }
  return tavilyInstance;
}

export interface TavilySearchOptions {
  includeDomains?: string[];
  excludeDomains?: string[];
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  customApiKey?: string;
}

export interface StandardSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  publishedDate?: string;
}

export interface StandardSearchResponse {
  query: string;
  results: StandardSearchResult[];
  provider: string;
}

// In-memory cache for sub-millisecond repeat queries
const tavilyCache = new Map<string, { timestamp: number; data: StandardSearchResponse }>();
const TAVILY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Searches the web via Tavily (using official SDK or direct REST endpoint with keyless/keyed mode).
 */
export async function searchTavily(
  query: string,
  options?: TavilySearchOptions
): Promise<StandardSearchResponse> {
  const cacheKey = JSON.stringify({ query: query.trim().toLowerCase(), ...options });
  const cached = tavilyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TAVILY_CACHE_TTL_MS) {
    return cached.data;
  }

  const apiKey = options?.customApiKey || process.env.TAVILY_API_KEY;

  if (apiKey) {
    const client = getTavilyClient(apiKey);
    if (client) {
      try {
        const resp = await client.search(query, {
          includeDomains: options?.includeDomains,
          excludeDomains: options?.excludeDomains,
          maxResults: options?.maxResults ?? 5,
          searchDepth: options?.searchDepth ?? 'basic',
        });

        const formatted: StandardSearchResponse = {
          query,
          provider: 'tavily',
          results: (resp.results || []).map((r: any) => ({
            title: r.title || '',
            url: r.url || '',
            content: r.content || '',
            score: r.score,
            publishedDate: r.publishedDate,
          })),
        };

        tavilyCache.set(cacheKey, { timestamp: Date.now(), data: formatted });
        return formatted;
      } catch (err: any) {
        console.warn('[TavilyClient] SDK search failed, trying HTTP endpoint:', err?.message);
      }
    }
  }

  // Keyless or direct HTTP fallback
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      headers['X-Tavily-Access-Mode'] = 'keyless';
    }

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        include_domains: options?.includeDomains,
        exclude_domains: options?.excludeDomains,
        max_results: options?.maxResults ?? 5,
        search_depth: options?.searchDepth ?? 'basic',
        ...(apiKey ? { api_key: apiKey } : {}),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Tavily API responded with HTTP ${res.status}: ${errorText}`);
    }

    const data: any = await res.json();
    const formatted: StandardSearchResponse = {
      query,
      provider: 'tavily',
      results: (data.results || []).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        content: r.content || '',
        score: r.score,
        publishedDate: r.published_date || r.publishedDate,
      })),
    };

    tavilyCache.set(cacheKey, { timestamp: Date.now(), data: formatted });
    return formatted;
  } catch (err: any) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Extracts clean web content from URLs via Tavily.
 */
export async function extractTavily(urls: string[], customApiKey?: string) {
  const apiKey = customApiKey || process.env.TAVILY_API_KEY;
  if (apiKey) {
    const client = getTavilyClient(apiKey);
    if (client) {
      try {
        return await client.extract(urls);
      } catch (err: any) {
        console.warn('[TavilyClient] SDK extract failed, trying HTTP endpoint:', err?.message);
      }
    }
  }

  const res = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : { 'X-Tavily-Access-Mode': 'keyless' }),
    },
    body: JSON.stringify({
      urls,
      ...(apiKey ? { api_key: apiKey } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily extract responded with HTTP ${res.status}`);
  }

  return res.json();
}
