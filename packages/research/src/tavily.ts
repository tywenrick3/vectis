import { tavily } from "@tavily/core";
import { getEnv, createLogger, retry } from "@vectis/shared";

const log = createLogger("research:tavily");

let _client: ReturnType<typeof tavily> | null = null;

function getClient() {
  if (!_client) {
    _client = tavily({ apiKey: getEnv().TAVILY_API_KEY });
  }
  return _client;
}

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

export async function search(
  query: string,
  maxResults: number = 5
): Promise<TavilySearchResult[]> {
  const client = getClient();

  log.info({ query, maxResults }, "Tavily search");

  const response = await retry(
    () => client.search(query, { maxResults }),
    { maxAttempts: 3, delayMs: 1000 }
  );

  return response.results.map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    score: r.score,
    published_date: r.publishedDate,
  }));
}

export async function extract(urls: string[]): Promise<{ url: string; content: string }[]> {
  const client = getClient();

  log.info({ urlCount: urls.length }, "Tavily extract");

  const response = await retry(
    () => client.extract(urls),
    { maxAttempts: 3, delayMs: 1000 }
  );

  return response.results.map((r) => ({
    url: r.url,
    content: r.rawContent,
  }));
}
