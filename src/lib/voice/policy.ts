export const realtimeModels = ["gpt-realtime-2.1", "gpt-realtime-2.1-mini"] as const;
export const realtimeVoices = ["marin", "cedar"] as const;
export type VoiceSelection = { model: typeof realtimeModels[number]; voice: typeof realtimeVoices[number] };

export const voicePolicy = {
  model: "gpt-realtime-2.1",
  voice: "marin",
  durationSeconds: 180,
  reserveCents: 50,
  dailyCents: 200,
  totalCents: 900,
  stopAtUsd: 0.30,
  maxResponses: 24,
  maxOutputTokens: 1024,
} as const;
