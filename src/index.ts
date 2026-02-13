// ============================================================
// AIBINGWA AGENT — Autonomous AI Trading Agent for Base
// ============================================================

// Core modules — re-export for consumers
export { SkillRegistry, type Skill, type SkillParameter } from "./skills.js";
export { AgentBrain } from "./brain.js";
export {
  type AgentMemory,
  type TradeEntry,
  type TokenMemory,
  loadMemory,
  saveMemory,
  logTrade,
  closeTrade,
  updateTokenMemory,
  getOpenPositions,
  getTradeHistory,
  getPerformanceSummary,
  setDataDir,
} from "./memory.js";
export { AutonomousTrader, type BankrPromptFn, type NotifyFn } from "./autonomous.js";
export { BankrX402Client } from "./bankr-x402.js";
export { TwitterClient, type TwitterConfig } from "./twitter.js";
export { registerAllSkills, type SkillDeps } from "./register-skills.js";

// Internal imports for AgentBingwa class
import { SkillRegistry } from "./skills.js";
import { AgentBrain } from "./brain.js";
import { setDataDir } from "./memory.js";
import { AutonomousTrader, type BankrPromptFn } from "./autonomous.js";
import { BankrX402Client } from "./bankr-x402.js";
import { TwitterClient } from "./twitter.js";

// ============================================================
// CONVENIENCE: AgentBingwa — All-in-one agent setup
// ============================================================

export interface AgentBingwaConfig {
  /** OpenAI API key for LLM reasoning */
  openaiApiKey?: string;
  /** OpenAI model to use (default: gpt-4o) */
  model?: string;
  /** Custom system prompt (use {{SKILLS}}, {{USER_NAME}}, {{INTERACTION_COUNT}} placeholders) */
  systemPrompt?: string;
  /** Bankr Agent API key for DeFi operations */
  bankrApiKey?: string;
  /** x402 private key for micropayment-based Bankr access */
  x402PrivateKey?: string;
  /** x402 wallet address (auto-derived from private key if not set) */
  x402WalletAddress?: string;
  /** Twitter/X OAuth 1.0a credentials */
  twitter?: {
    appKey: string;
    appSecret: string;
    accessToken: string;
    accessSecret: string;
  };
  /** Directory to store persistent memory (default: ./data) */
  dataDir?: string;
  /** Telegram bot owner chat ID for notifications */
  ownerChatId?: string;
  /** Notification callback for trade alerts */
  onNotify?: (message: string) => Promise<void>;
}

export class AgentBingwa {
  public skills: SkillRegistry;
  public brain: AgentBrain | null = null;
  public trader: AutonomousTrader | null = null;
  public x402Client: BankrX402Client | null = null;
  public twitterClient: TwitterClient | null = null;

  private config: AgentBingwaConfig;
  private bankrApiKey: string;

  constructor(config: AgentBingwaConfig) {
    this.config = config;
    this.bankrApiKey = config.bankrApiKey || process.env.BANKR_API_KEY || "";

    // Set data directory
    if (config.dataDir) {
      setDataDir(config.dataDir);
    }

    // Initialize skill registry
    this.skills = new SkillRegistry();

    // Initialize x402 client
    if (config.x402PrivateKey || process.env.X402_PRIVATE_KEY) {
      this.x402Client = new BankrX402Client({
        privateKey: config.x402PrivateKey,
        walletAddress: config.x402WalletAddress,
      });
    }

    // Initialize Twitter client
    if (config.twitter) {
      this.twitterClient = new TwitterClient(config.twitter);
    } else if (process.env.X_CONSUMER_KEY) {
      this.twitterClient = new TwitterClient();
    }

    // Initialize brain
    const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        this.brain = new AgentBrain(this.skills, {
          apiKey,
          model: config.model,
          systemPrompt: config.systemPrompt,
        });
      } catch (err: any) {
        console.warn("⚠️ Brain init failed:", err.message);
      }
    }

    // Initialize autonomous trader
    const notify = config.onNotify || (async () => {});
    if (this.bankrApiKey || (this.x402Client && this.x402Client.isAvailable())) {
      this.trader = new AutonomousTrader(
        this.createBankrPrompt(),
        notify,
      );
    }

    console.log("🚀 AgentBingwa initialized");
    console.log(`   Skills: ${this.skills.getAll().length}`);
    console.log(`   Brain: ${this.brain ? "✅" : "❌ (no OPENAI_API_KEY)"}`);
    console.log(`   Trader: ${this.trader ? "✅" : "❌ (no BANKR_API_KEY)"}`);
    console.log(`   x402: ${this.x402Client?.isAvailable() ? "✅" : "❌"}`);
    console.log(`   Twitter: ${this.twitterClient?.isAvailable() ? "✅" : "❌"}`);
  }

  // ── PROCESS MESSAGE ──────────────────────────────────────
  async processMessage(
    chatId: string,
    userName: string,
    message: string,
    statusCallback?: (status: string) => Promise<void>
  ): Promise<string> {
    if (!this.brain) {
      return "⚠️ Agent brain not initialized. Set OPENAI_API_KEY to enable AI reasoning.";
    }
    return this.brain.processMessage(chatId, userName, message, statusCallback);
  }

  // ── START AUTONOMOUS TRADING ─────────────────────────────
  startTrading(): void {
    if (this.trader) {
      this.trader.start();
    } else {
      console.warn("⚠️ Cannot start trading — no Bankr API key or x402 configured");
    }
  }

  stopTrading(): void {
    if (this.trader) {
      this.trader.stop();
    }
  }

  // ── BANKR PROMPT ─────────────────────────────────────────
  public getBankrPrompt(): BankrPromptFn {
    return this.createBankrPrompt();
  }

  private createBankrPrompt(): BankrPromptFn {
    const apiKey = this.bankrApiKey;
    const x402 = this.x402Client;

    return async (prompt: string, threadId?: string) => {
      // Try x402 first if available
      if (x402 && x402.isAvailable()) {
        const result = await x402.prompt(prompt);
        return {
          success: result.success,
          jobId: result.jobId,
          status: result.status,
          response: result.response,
          error: result.error,
        };
      }

      // Fall back to API key mode
      if (!apiKey) {
        return { success: false, jobId: "", status: "no_key", error: "No Bankr API key or x402 configured" };
      }

      try {
        const body: any = { prompt };
        if (threadId) body.threadId = threadId;

        const res = await fetch("https://api.bankr.bot/v2/prompt", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          return { success: false, jobId: "", status: "failed", error: `API error: ${res.status}` };
        }

        const data = await res.json() as any;
        const jobId = data.jobId;

        if (!jobId) {
          return { success: false, jobId: "", status: "failed", error: "No job ID" };
        }

        // Poll for results
        for (let i = 0; i < 45; i++) {
          await new Promise(r => setTimeout(r, 2000));

          const pollRes = await fetch(`https://api.bankr.bot/v2/job/${jobId}`, {
            headers: { "x-api-key": apiKey },
          });

          if (!pollRes.ok) continue;
          const pollData = await pollRes.json() as any;

          if (pollData.status === "completed") {
            return {
              success: true,
              jobId,
              threadId: pollData.threadId,
              status: "completed",
              response: pollData.response,
            };
          }

          if (pollData.status === "failed" || pollData.status === "cancelled") {
            return {
              success: false,
              jobId,
              status: pollData.status,
              error: pollData.response || "Job failed",
            };
          }
        }

        return { success: false, jobId, status: "timeout", error: "Request timed out" };
      } catch (err: any) {
        return { success: false, jobId: "", status: "failed", error: err.message };
      }
    };
  }

  // ── UTILITY ──────────────────────────────────────────────
  getSkillCount(): number {
    return this.skills.getAll().length;
  }

  isBrainOnline(): boolean {
    return !!this.brain;
  }

  isTraderActive(): boolean {
    return !!this.trader;
  }
}
