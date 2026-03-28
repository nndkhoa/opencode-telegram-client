import type { Context } from "grammy";
import type { SessionRegistry } from "../../session/registry.js";
import { patchConfig, getConfigProviders, getConfig } from "../../opencode/config.js";
import { logger } from "../../logger.js";

export function makeCmdModelHandler(_registry: SessionRegistry, openCodeUrl: string) {
  return async (ctx: Context): Promise<void> => {
    const arg = ((ctx.match as string | undefined) ?? "").trim();

    if (arg.length === 0) {
      let currentModel: string;
      try {
        const cfg = await getConfig(openCodeUrl);
        currentModel = cfg.model ?? "unknown";
      } catch {
        currentModel = "unknown";
      }

      let providers: Record<string, { name: string; models: Record<string, unknown> }>;
      try {
        providers = await getConfigProviders(openCodeUrl);
      } catch (err) {
        logger.error({ err }, "Failed to fetch config providers");
        await ctx.reply("❌ Could not fetch available models. Is OpenCode running?");
        return;
      }

      const lines: string[] = [`Model: ${currentModel}`, "", "Available models:"];
      const sortedProviderIds = Object.keys(providers).sort();
      for (const providerID of sortedProviderIds) {
        const provider = providers[providerID];
        const modelIds = Object.keys(provider.models);
        if (modelIds.length === 0) continue;
        lines.push(`${provider.name}: ${modelIds.join(", ")}`);
      }

      await ctx.reply(lines.join("\n"));
    } else {
      try {
        await patchConfig(openCodeUrl, arg);
        logger.info({ model: arg }, "Model switched");
        await ctx.reply(`✅ Model switched to ${arg} (global — affects all sessions).`);
      } catch (err) {
        if (err instanceof Error && err.message === "unknown_model") {
          await ctx.reply(`❌ Unknown model "${arg}". Run /model to see available models.`);
        } else {
          logger.error({ err, model: arg }, "Failed to switch model");
          await ctx.reply("❌ Could not switch model. Is OpenCode running?");
        }
      }
    }
  };
}
