import { z } from 'zod';

export const SpeechResultSchema = z.object({
  type: z.string(),
  is_final: z.boolean().optional(),
  channel: z
    .object({
      alternatives: z
        .array(
          z.object({
            transcript: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});
