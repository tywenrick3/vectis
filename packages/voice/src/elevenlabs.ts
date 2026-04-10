import { getEnv, getDb, createLogger, type Script, type VoiceAsset } from "@vectis/shared";
import { uploadToR2 } from "./storage.js";
import { normalizeNumbersForSpeech } from "./normalize-numbers.js";

const log = createLogger("voice:elevenlabs");

interface ElevenLabsResponse {
  audio: ArrayBuffer;
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}

export async function synthesize(script: Script): Promise<VoiceAsset> {
  const env = getEnv();
  const db = getDb();

  // Convert digits to spoken English so the model reads them naturally
  // (e.g. "$200,000" → "two hundred thousand dollars"). The DB row keeps
  // the original digit-form text — only the TTS request is rewritten.
  const spokenText = normalizeNumbersForSpeech(script.full_text);

  log.info({ scriptId: script.id }, "Synthesizing voice");

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: spokenText,
        model_id: "eleven_flash_v2_5",
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.75,
          style: 0.45,
          speed: 1.15,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} ${err}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const audioKey = `audio/${script.id}.mp3`;

  const audioUrl = await uploadToR2(
    Buffer.from(audioBuffer),
    audioKey,
    "audio/mpeg"
  );

  // Estimate duration from character count (~17 chars/sec at speed 1.15)
  const estimatedDurationMs = Math.round((script.full_text.length / 17) * 1000);
  const estimatedCost = (script.full_text.length / 1000) * 0.06;

  const { data, error } = await db
    .from("voice_assets")
    .insert({
      script_id: script.id,
      audio_url: audioUrl,
      duration_ms: estimatedDurationMs,
      cost: estimatedCost,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to insert voice asset: ${error.message}`);

  log.info({ voiceAssetId: data.id, durationMs: estimatedDurationMs }, "Voice synthesized");
  return data as VoiceAsset;
}
