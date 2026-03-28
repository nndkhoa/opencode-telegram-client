import { z } from "zod";

const EnvSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  OPENCODE_URL: z.string().url().default("http://localhost:4096"),
  ALLOWED_USER_IDS: z
    .string()
    .min(1, "ALLOWED_USER_IDS must be a non-empty comma-separated list of Telegram user IDs")
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => {
          const n = Number.parseInt(x, 10);
          if (Number.isNaN(n) || n <= 0) throw new Error(`Invalid user ID: "${x}"`);
          return n;
        })
    )
    .pipe(z.array(z.number().int().positive()).nonempty()),
});

export type Config = {
  botToken: string;
  openCodeUrl: string;
  allowedUserIds: Set<number>;
};

export function parseEnv(raw: NodeJS.ProcessEnv): Config {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(result.error.issues.map((i) => i.message).join("; "));
  }
  const d = result.data;
  return {
    botToken: d.BOT_TOKEN,
    openCodeUrl: d.OPENCODE_URL,
    allowedUserIds: new Set(d.ALLOWED_USER_IDS),
  };
}
