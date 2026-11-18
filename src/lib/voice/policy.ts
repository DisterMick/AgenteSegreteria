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
