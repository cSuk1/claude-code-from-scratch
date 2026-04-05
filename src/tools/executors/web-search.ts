import { search as duckDuckGoSearch } from 'duck-duck-scrape';
import { SafeSearchType } from 'duck-duck-scrape/lib/util.js';

export async function webSearch(input: {
  query: string;
  max_results?: number;
}): Promise<string> {
  try {
    const maxResults = Math.min(input.max_results || 10, 20);

    const searchResults = await duckDuckGoSearch(input.query, {
      safeSearch: SafeSearchType.MODERATE,
    });

    if (!searchResults.results || searchResults.results.length === 0) {
      return "No search results found.";
    }

    const results = searchResults.results
      .slice(0, maxResults)
      .map((result: any) => ({
        title: result.title || 'No title',
        url: result.url || result.link || '',
        snippet: result.snippet || result.description || '',
      }));

    const formatted = results
      .map((r: any, i: number) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
      .join('\n\n');

    return `Found ${results.length} results for "${input.query}":\n\n${formatted}`;
  } catch (e: any) {
    return `Web search temporarily unavailable: ${e.message}. Consider using a browser to search for "${input.query}".`;
  }
}
