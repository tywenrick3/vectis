import {
  createLogger,
  getDb,
  getEnv,
  retry,
  type VoiceAsset,
  type Transcription,
  type TranscriptionWord,
} from "@vectis/shared";

const log = createLogger("assembly:transcribe");

export async function transcribe(voiceAsset: VoiceAsset): Promise<Transcription> {
  const db = getDb();
  const env = getEnv();

  // Dedup: reuse existing transcription for same voice asset
  const { data: existing } = await db
    .from("transcriptions")
    .select()
    .eq("voice_asset_id", voiceAsset.id)
    .single();

  if (existing) {
    log.info({ transcriptionId: existing.id }, "Reusing existing transcription");
    return existing as Transcription;
  }

  log.info({ voiceAssetId: voiceAsset.id }, "Transcribing audio");

  // Download audio from R2
  const audioResponse = await fetch(voiceAsset.audio_url);
  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio: ${audioResponse.status}`);
  }
  const audioBuffer = await audioResponse.arrayBuffer();

  // Call OpenAI Whisper API
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), "audio.mp3");
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");

  const whisperResponse = await retry(
    async () => {
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Whisper API error ${res.status}: ${body}`);
      }

      return res.json();
    },
    { maxAttempts: 3, delayMs: 2000, backoffMultiplier: 2 }
  );

  const words: TranscriptionWord[] = (whisperResponse.words ?? []).map(
    (w: { word: string; start: number; end: number }) => ({
      word: w.word.trim(),
      start_ms: Math.round(w.start * 1000),
      end_ms: Math.round(w.end * 1000),
    })
  );

  const durationMs = words.length > 0 ? words[words.length - 1].end_ms : 0;
  // Whisper API: $0.006 per minute
  const cost = (durationMs / 60_000) * 0.006;

  const { data, error } = await db
    .from("transcriptions")
    .insert({
      voice_asset_id: voiceAsset.id,
      words,
      full_text: whisperResponse.text ?? "",
      duration_ms: durationMs,
      cost,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to insert transcription: ${error.message}`);

  log.info({ transcriptionId: data.id, wordCount: words.length }, "Transcription complete");
  return data as Transcription;
}
