import FirecrawlApp from "@mendable/firecrawl-js";
import { getEnv, createLogger, retry } from "@vectis/shared";

const log = createLogger("research:firecrawl");

let _client: FirecrawlApp | null = null;

function getClient() {
  if (!_client) {
    _client = new FirecrawlApp({ apiKey: getEnv().FIRECRAWL_API_KEY });
  }
  return _client;
}

export interface ScrapeResult {
  url: string;
  markdown: string;
  title?: string;
  description?: string;
}

export async function scrape(url: string): Promise<ScrapeResult> {
  const client = getClient();

  log.info({ url }, "Firecrawl scrape");

  const response = await retry(
    () => client.scrapeUrl(url, { formats: ["markdown"] }),
    { maxAttempts: 3, delayMs: 1000 }
  );

  if (!response.success) {
    throw new Error(`Firecrawl scrape failed for ${url}: ${response.error}`);
  }

  return {
    url,
    markdown: response.markdown ?? "",
    title: response.metadata?.title,
    description: response.metadata?.description,
  };
}

export async function batchScrape(urls: string[]): Promise<ScrapeResult[]> {
  if (urls.length === 0) return [];

  const client = getClient();

  log.info({ urlCount: urls.length }, "Firecrawl batch scrape");

  const response = await retry(
    () => client.batchScrapeUrls(urls, { formats: ["markdown"] }),
    { maxAttempts: 3, delayMs: 1000 }
  );

  if (!response.success) {
    throw new Error(`Firecrawl batch scrape failed: ${response.error}`);
  }

  return response.data.map((r) => ({
    url: r.metadata?.sourceURL ?? r.metadata?.url ?? "",
    markdown: r.markdown ?? "",
    title: r.metadata?.title,
    description: r.metadata?.description,
  }));
}
