import { getDb, createLogger, type ResearchBrief, type TrendingTopic, type NewsItem, type SourceItem } from "@vectis/shared";
import { search, extract } from "./tavily.js";

const log = createLogger("research:brief");

export async function buildResearchBrief(niche: string): Promise<ResearchBrief> {
  const db = getDb();

  log.info({ niche }, "Building research brief");

  // Run all 5 search types in parallel
  const [trendingRaw, newsRaw, competitorRaw, saturationRaw, sourceRaw] =
    await Promise.all([
      search(`trending ${niche} short-form video topics 2024 2025`, 5),
      search(`latest news ${niche} today this week`, 5),
      search(`top ${niche} creators TikTok YouTube Shorts viral videos`, 5),
      search(`most common ${niche} video topics oversaturated played out`, 5),
      search(`${niche} surprising facts statistics data points 2024 2025`, 5),
    ]);

  // Extract source material from top results
  const topSourceUrls = sourceRaw
    .filter((r) => r.score > 0.5)
    .slice(0, 3)
    .map((r) => r.url);

  const extractedSources =
    topSourceUrls.length > 0 ? await extract(topSourceUrls) : [];

  // Map to typed structures
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
    fact: s.content.slice(0, 500),
    source_url: s.url,
    type: "data_point" as const,
  }));

  // Store in Supabase
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
    },
    "Research brief built"
  );

  return data as ResearchBrief;
}
