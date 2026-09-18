import type { TinyFish as TinyFishType, SearchQueryResponse, SearchResult, FetchResponse } from '@tiny-fish/sdk';

let tinyFishInstance: TinyFishType | null = null;

export async function getTinyFishClient(): Promise<TinyFishType> {
  if (tinyFishInstance) return tinyFishInstance;

  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey) {
    throw new Error('TINYFISH_API_KEY environment variable is not configured');
  }

  const { TinyFish } = await import('@tiny-fish/sdk');
  tinyFishInstance = new TinyFish({ apiKey });
  return tinyFishInstance;
}

export function _resetTinyFishClientForTesting(): void {
  tinyFishInstance = null;
}

export interface SearchOptions {
  location?: string;
  language?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  page?: number;
}

// In-memory cache for fast, sub-millisecond repeated searches
const searchCache = new Map<string, { timestamp: number; data: SearchQueryResponse }>();
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Executes a fast, grounded web search via TinyFish with in-memory caching.
 */
export async function searchWeb(query: string, options?: SearchOptions): Promise<SearchQueryResponse> {
  const cacheKey = JSON.stringify({ query: query.trim().toLowerCase(), ...options });
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
    return cached.data;
  }

  const client = await getTinyFishClient();
  const response = await client.search.query({
    query,
    location: options?.location,
    language: options?.language,
    include_domains: options?.includeDomains ? options.includeDomains.join(',') : undefined,
    exclude_domains: options?.excludeDomains ? options.excludeDomains.join(',') : undefined,
    page: options?.page,
  });

  searchCache.set(cacheKey, { timestamp: Date.now(), data: response });
  return response;
}

/**
 * Fetches and extracts clean markdown/text content from one or more URLs.
 */
export async function fetchWebPages(urls: string[]): Promise<FetchResponse> {
  const client = await getTinyFishClient();
  return client.fetch.getContents({
    urls,
  });
}

/**
 * Runs a browser automation agent to achieve a natural language goal on a page.
 */
export async function runWebAutomation(goal: string, url: string) {
  const client = await getTinyFishClient();
  return client.agent.run({
    goal,
    url,
  });
}

export type { SearchQueryResponse, SearchResult, FetchResponse };
