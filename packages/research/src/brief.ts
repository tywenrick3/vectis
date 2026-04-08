import { getDb, createLogger, type ResearchBrief, type TrendingTopic, type NewsItem, type SourceItem } from "@vectis/shared";
import { getPerformanceContext } from "@vectis/analytics";
import { search, type TavilySearchResult } from "./tavily.js";
import { batchScrape, scrape } from "./firecrawl.js";

const log = createLogger("research:brief");

type QueryCategory = "trending" | "news" | "competitor" | "saturation" | "source" | "insider" | "events";

interface TaggedQuery {
  category: QueryCategory;
  query: string;
}

function getResearchQueries(niche: string): TaggedQuery[] {
  return [
    { category: "trending", query: `${niche} viral moment breakthrough this week 2025 2026` },
    { category: "news", query: `latest ${niche} news specific event announcement this week` },
    { category: "competitor", query: `top ${niche} creators TikTok YouTube Shorts viral videos this month` },
    { category: "saturation", query: `most common ${niche} video topics oversaturated played out boring` },
    { category: "source", query: `${niche} surprising statistic data point nobody knows 2025 2026` },
    { category: "insider", query: `${niche} behind the scenes insider revelation secret leaked 2025 2026` },
    { category: "events", query: `${niche} controversy scandal unexpected failure drama this month` },
  ];
}

export async function buildResearchBrief(niche: string): Promise<ResearchBrief> {
  const db = getDb();

  log.info({ niche }, "Building research brief");

  const queries = getResearchQueries(niche);

  // Run all searches in parallel
  const rawResults = await Promise.all(
    queries.map((q) => search(q.query, 5))
  );

  // Tag results by category
  const resultsByCategory = new Map<QueryCategory, TavilySearchResult[]>();
  for (let i = 0; i < queries.length; i++) {
    resultsByCategory.set(queries[i].category, rawResults[i]);
  }

  // Collect top URLs from ALL categories for scraping (deduplicated, score > 0.5, max 8)
  const urlScores = new Map<string, number>();
  for (const results of rawResults) {
    for (const r of results) {
      if (r.score > 0.5 && (!urlScores.has(r.url) || urlScores.get(r.url)! < r.score)) {
        urlScores.set(r.url, r.score);
      }
    }
  }
  const topScrapeUrls = [...urlScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([url]) => url);

  let extractedSources: Awaited<ReturnType<typeof batchScrape>> = [];
  if (topScrapeUrls.length > 0) {
    try {
      extractedSources = await batchScrape(topScrapeUrls);
    } catch (err) {
      log.warn({ err, urls: topScrapeUrls }, "Batch scrape failed, falling back to individual scrapes");
      for (const url of topScrapeUrls) {
        try {
          const result = await scrape(url);
          extractedSources.push(result);
        } catch (innerErr) {
          log.warn({ err: innerErr, url }, "Scrape failed for URL, skipping");
        }
      }
    }
  }

  // Map to typed structures
  const trendingRaw = resultsByCategory.get("trending") ?? [];
  const newsRaw = resultsByCategory.get("news") ?? [];
  const competitorRaw = resultsByCategory.get("competitor") ?? [];
  const saturationRaw = resultsByCategory.get("saturation") ?? [];

  const trending_topics: TrendingTopic[] = trendingRaw.map((r) => ({
    title: r.title,
    source: r.url,
    velocity: Math.round(r.score * 100),
    freshness: r.published_date ?? "unknown",
  }));

  const recent_news: NewsItem[] = newsRaw.map((r) => ({
    headline: r.title,
    summary: r.content.slice(0, 300),
    url: r.url,
    published_at: r.published_date ?? new Date().toISOString(),
  }));

  const competitor_angles: string[] = competitorRaw.map(
    (r) => `${r.title}: ${r.content.slice(0, 150)}`
  );

  const saturation_signals: string[] = saturationRaw.map(
    (r) => `${r.title}: ${r.content.slice(0, 150)}`
  );

  const source_material: SourceItem[] = extractedSources.map((s) => ({
    fact: s.markdown.slice(0, 2000),
    source_url: s.url,
    type: "data_point" as const,
  }));

  // Fetch performance context (recently covered, top/low performers)
  const { recently_covered, top_performers, low_performers } =
    await getPerformanceContext(niche);

  // Store in Supabase (recently_covered is derived, not persisted)
  const { data, error } = await db
    .from("research_briefs")
    .insert({
      niche,
      trending_topics,
      recent_news,
      competitor_angles,
      saturation_signals,
      source_material,
      searched_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to store research brief: ${error.message}`);

  log.info(
    {
      briefId: data.id,
      trends: trending_topics.length,
      news: recent_news.length,
      sources: source_material.length,
      recentlyCovered: recently_covered.length,
    },
    "Research brief built"
  );

  return { ...data, recently_covered, top_performers, low_performers } as ResearchBrief;
}
