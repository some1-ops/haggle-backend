import { searchWeb, fetchWebPages } from './tinyfish';
import { searchTavily, extractTavily, type StandardSearchResult } from './tavily';

export interface UnifiedSearchOptions {
  includeDomains?: string[];
  excludeDomains?: string[];
  location?: string;
  language?: string;
  customTavilyKey?: string;
}

export interface UnifiedSearchResult {
  query: string;
  results: StandardSearchResult[];
  provider: 'tinyfish' | 'tavily';
  fallbackOccurred: boolean;
  attempts: Array<{
    provider: string;
    durationMs: number;
    success: boolean;
    error?: string;
  }>;
  latencyMs: number;
}

/**
 * Dual Search Pipeline:
 * TinyFish is the default primary search engine.
 * If TinyFish fails (timeout, rate limit, quota, network error), it automatically fails over
 * to Tavily seamlessly without showing errors to caller operations.
 */
export async function executeDualSearch(
  query: string,
  options?: UnifiedSearchOptions
): Promise<UnifiedSearchResult> {
  const attempts: UnifiedSearchResult['attempts'] = [];
  const overallStart = Date.now();

  // 1. Primary Path: TinyFish
  try {
    const t0 = Date.now();
    const tfRes = await searchWeb(query, {
      includeDomains: options?.includeDomains,
      excludeDomains: options?.excludeDomains,
      location: options?.location,
      language: options?.language,
    });
    const durationMs = Date.now() - t0;

    const results: StandardSearchResult[] = (tfRes.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.snippet || r.content || '',
      score: r.score,
    }));

    attempts.push({ provider: 'tinyfish', durationMs, success: true });

    return {
      query,
      results,
      provider: 'tinyfish',
      fallbackOccurred: false,
      attempts,
      latencyMs: Date.now() - overallStart,
    };
  } catch (tfErr: any) {
    const durationMs = Date.now() - overallStart;
    console.warn(`[DualSearchPipeline] Primary provider 'tinyfish' failed: ${tfErr?.message}. Seamlessly failing over to 'tavily'...`);
    attempts.push({
      provider: 'tinyfish',
      durationMs,
      success: false,
      error: tfErr?.message || 'Unknown error',
    });
  }

  // 2. Backup Path: Tavily
  try {
    const t0 = Date.now();
    const tavilyRes = await searchTavily(query, {
      includeDomains: options?.includeDomains,
      excludeDomains: options?.excludeDomains,
      customApiKey: options?.customTavilyKey,
    });
    const durationMs = Date.now() - t0;

    attempts.push({ provider: 'tavily', durationMs, success: true });

    return {
      query,
      results: tavilyRes.results,
      provider: 'tavily',
      fallbackOccurred: true,
      attempts,
      latencyMs: Date.now() - overallStart,
    };
  } catch (tavilyErr: any) {
    const durationMs = Date.now() - overallStart;
    console.error(`[DualSearchPipeline] Backup provider 'tavily' failed: ${tavilyErr?.message}`);
    attempts.push({
      provider: 'tavily',
      durationMs,
      success: false,
      error: tavilyErr?.message || 'Unknown error',
    });

    // Both failed: return empty array rather than a fatal 500 error to ensure client never crashes
    return {
      query,
      results: [],
      provider: 'tavily',
      fallbackOccurred: true,
      attempts,
      latencyMs: Date.now() - overallStart,
    };
  }
}

/**
 * Dual Content Extraction Pipeline:
 * TinyFish default primary, Tavily backup.
 */
export async function executeDualExtract(urls: string[], customTavilyKey?: string) {
  try {
    const tfContent = await fetchWebPages(urls);
    return {
      provider: 'tinyfish',
      fallbackOccurred: false,
      data: tfContent,
    };
  } catch (tfErr: any) {
    console.warn(`[DualExtractPipeline] TinyFish extract failed: ${tfErr?.message}. Failing over to Tavily...`);
    try {
      const tavilyContent = await extractTavily(urls, customTavilyKey);
      return {
        provider: 'tavily',
        fallbackOccurred: true,
        data: tavilyContent,
      };
    } catch (tavErr: any) {
      console.error(`[DualExtractPipeline] Tavily extract also failed: ${tavErr?.message}`);
      return {
        provider: 'none',
        fallbackOccurred: true,
        data: null,
      };
    }
  }
}
