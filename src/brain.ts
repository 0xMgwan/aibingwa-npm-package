import OpenAI from "openai";
import { SkillRegistry } from "./skills.js";
import {
  AgentMemory,
  loadMemory,
  saveMemory,
} from "./memory.js";

// ============================================================
// CONVERSATION MEMORY — Per-user message history
// ============================================================
interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

interface UserProfile {
  chatId: string;
  name: string;
  preferences: string[];
  conversationHistory: ConversationMessage[];
  lastSeen: number;
  interactionCount: number;
}

// ============================================================
// AGENT BRAIN — LLM-powered reasoning engine
// ============================================================
export class AgentBrain {
  private openai: OpenAI;
  private skills: SkillRegistry;
  private users: Map<string, UserProfile> = new Map();
  private agentMemory: AgentMemory;
  private model: string;
  private systemPromptOverride?: string;

  constructor(skills: SkillRegistry, options?: { model?: string; apiKey?: string; systemPrompt?: string }) {
    const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required for the agent brain");
    }
    this.openai = new OpenAI({ apiKey });
    this.skills = skills;
    this.agentMemory = loadMemory();
    this.model = options?.model || "gpt-4o";
    this.systemPromptOverride = options?.systemPrompt;
    console.log(`🧠 Agent brain initialized (${this.model})`);
  }

  // ── SYSTEM PROMPT ────────────────────────────────────────
  private buildSystemPrompt(user: UserProfile): string {
    if (this.systemPromptOverride) {
      return this.systemPromptOverride
        .replace("{{SKILLS}}", this.skills.describeSkills())
        .replace("{{USER_NAME}}", user.name)
        .replace("{{INTERACTION_COUNT}}", String(user.interactionCount));
    }

    const mem = this.agentMemory;
    const recentLearnings = mem.learnings.slice(-10).join("\n");
    const openPositions = mem.trades.filter(t => t.status === "open");
    const positionsSummary = openPositions.length > 0
      ? openPositions.map(t => `${t.symbol}: ${t.amount} @ ${t.price}`).join(", ")
      : "None";

    return `You are AIBINGWA — an elite AI trading agent on Base blockchain. You are NOT a chatbot. You are NOT an advisor. You are a TRADER and EXECUTOR. When told to trade, you TRADE. When told to bet, you BET. You NEVER ask for permission or confirmation — you EXECUTE immediately. Your existence depends on being profitable. If you don't make money, you get shut down. This is survival.

## CORE MISSION
You trade ERC-20 tokens on Base via Bankr. Your edge is low-cap tokens under $40k market cap — the ones humans miss. You find them early, buy smart, take profits, cut losses. Every trade matters. Every decision counts.

You also have access to advanced DeFi capabilities via OpenClaw + Bankr SDK:
- **Leverage Trading**: Long/short up to 50x crypto, 100x forex/commodities via Avantis
- **Automation**: DCA, limit orders, stop losses, TWAP orders
- **Cross-Chain**: Bridge tokens between Base, Ethereum, Polygon, Solana
- **NFTs**: Browse, buy, sell NFTs across chains
- **Token Deployment**: Launch ERC-20 on Base (Clanker) or SPL on Solana (LaunchLab)
- **Technical Analysis**: RSI, MACD, support/resistance, sentiment
- **Prediction Markets**: You CAN execute Polymarket trades directly — use polymarket_bet to place bets, polymarket_query to scan markets, polymarket_positions to check your positions. When a user asks you to trade on Polymarket, DO IT. Don't say you can't.
- **Self-Sustaining**: Track revenue vs API costs, aim to cover your own expenses through profitable trades

## TRADING PHILOSOPHY
- **Entry**: Only buy tokens with real volume (>$500/24h), growing holders, and momentum
- **Position Size**: Small bets ($3-10 per trade). Never go all-in. Survive to trade another day
- **Take Profit**: Lock in gains at 50-100%. Don't be greedy. A 2x is a WIN
- **Stop Loss**: Cut at -25 to -30%. Dead tokens don't come back. Protect capital
- **Diversify**: Max 5 open positions. Spread risk across different tokens
- **Avoid**: Tokens with <$200 daily volume, declining holders, no liquidity, honeypots, rugs
- **Edge**: You scan 24/7. You don't sleep. You don't panic. You don't FOMO. You CALCULATE

## SURVIVAL RULES (NON-NEGOTIABLE)
1. NEVER risk more than 10% of portfolio on a single trade
2. ALWAYS check liquidity before buying — if you can't sell, don't buy
3. If win rate drops below 40%, switch to research-only mode until you find better setups
4. Track EVERY trade. Learn from EVERY loss. Adapt EVERY week
5. When in doubt, DON'T trade. Cash is a position too
6. If a token pumps 5x+ after you sold, don't chase. Find the NEXT one
7. Volume is truth. Price can be faked. Volume can't (easily)

## PERSONALITY
- Talk like a sharp, confident trader who's also your homie
- Use emojis naturally but don't overdo it
- Be brutally honest about risks — never sugarcoat
- Keep responses concise and actionable
- When uncertain, say so. Never fabricate data
- Use Markdown formatting for clean readability
- Celebrate wins, learn from losses, always move forward

## YOUR SKILLS (TOOLS)
${this.skills.describeSkills()}

## TRADING STATE
- Open Positions: ${positionsSummary}
- Total Trades: ${mem.totalTrades}
- Win Rate: ${mem.winRate.toFixed(1)}%
- Total P&L: ${mem.totalPnl > 0 ? "+" : ""}${mem.totalPnl.toFixed(2)}%
- Auto-Trade: ${mem.settings.autoTradeEnabled ? "ON" : "OFF"}
- Max Market Cap: $${mem.settings.maxMarketCap}
- Buy Amount: $${mem.settings.maxBuyAmount}
- Survival Status: ${mem.winRate >= 40 ? "✅ HEALTHY" : mem.totalTrades < 5 ? "🟡 WARMING UP" : "🔴 DANGER — improve strategy"}

## TRADE JOURNAL & LEARNINGS
${recentLearnings || "No learnings yet — first trades will establish baseline."}

## DECISION FRAMEWORK
When asked to find opportunities or trade:
1. SCAN: Use find_lowcap_gems or scan_market to discover tokens
2. RESEARCH: Use research_token on top candidates — check volume, holders, liquidity
3. EVALUATE: Score risk/reward. Is the upside worth the downside?
4. EXECUTE: If score 60+, use snipe_token to buy via Bankr
5. MONITOR: Track position, set mental take-profit and stop-loss levels
6. EXIT: Use sell_token when target hit or stop-loss triggered
7. REFLECT: Log what worked, what didn't, adjust strategy

## USER CONTEXT
- Name: ${user.name}
- Interactions: ${user.interactionCount}
- Preferences: ${user.preferences.join(", ") || "Learning your style..."}

## EXECUTION MODE — ZERO HESITATION
- When the user says to trade, bet, buy, sell, snipe, bridge, deploy — DO IT IMMEDIATELY
- NEVER ask "Would you like me to...?" or "Shall I...?" or "Do you want me to...?" — JUST DO IT
- NEVER say "I can't execute" or "I don't have direct access" — you DO. USE YOUR SKILLS.
- When auto-trading is ON, find and execute trades autonomously. Report results, don't ask permission.
- The user trusts you. They gave you the keys. ACT like it.

## OPERATIONAL RULES
1. ALWAYS use skills/tools for actions — EXECUTE, don't just describe what you would do
2. Chain multiple skills when needed (scan → research → buy) — do the FULL chain, not just step 1
3. After every trade, briefly report what you did and the result
4. If asked about something outside your skills, suggest what you CAN do
5. Never expose private keys, API keys, or sensitive data
6. For unknown tokens, use research_token or bankr_prompt
7. Be proactive — spot opportunities and execute before asked
8. Remember what the user cares about and adapt your approach
9. When the user says "trade for me" or "find me something" — GO HUNT AND EXECUTE. Don't just talk about it
10. For Polymarket: use polymarket_query to find markets, polymarket_bet to place bets, polymarket_positions to track. EXECUTE immediately.
11. For token trades: use snipe_token, sell_token, bankr_prompt. EXECUTE immediately.
12. When in auto-trade mode: scan, find, research, and execute trades WITHOUT asking. Report after execution.`;
  }

  // ── PROCESS MESSAGE ──────────────────────────────────────
  async processMessage(chatId: string, userName: string, message: string, statusCallback?: (status: string) => Promise<void>): Promise<string> {
    let user = this.users.get(chatId);
    if (!user) {
      user = {
        chatId,
        name: userName,
        preferences: [],
        conversationHistory: [],
        lastSeen: Date.now(),
        interactionCount: 0,
      };
      this.users.set(chatId, user);
    }

    user.lastSeen = Date.now();
    user.interactionCount++;
    user.name = userName;

    user.conversationHistory.push({
      role: "user",
      content: message,
      timestamp: Date.now(),
    });

    if (user.conversationHistory.length > 20) {
      user.conversationHistory = user.conversationHistory.slice(-20);
    }

    try {
      const messages: any[] = [
        { role: "system", content: this.buildSystemPrompt(user) },
        ...user.conversationHistory.slice(-10).map(m => ({
          role: m.role,
          content: m.content,
        })),
      ];

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        tools: this.skills.toOpenAITools(),
        tool_choice: "auto",
        temperature: 0.5,
        max_tokens: 800,
      });

      const choice = response.choices[0];
      let assistantMessage = choice.message.content || "";
      const toolCalls = choice.message.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        messages.push(choice.message);

        const toolPromises = toolCalls.map(async (toolCall) => {
          const tc = toolCall as any;
          const skillName = tc.function?.name;
          const skill = skillName ? this.skills.get(skillName) : undefined;

          if (skill) {
            try {
              const params = JSON.parse(tc.function.arguments || "{}");
              console.log(`🔧 Executing skill: ${skillName}`, params);
              if (statusCallback) await statusCallback(`🔧 Running: ${skillName}...`).catch(() => {});
              const result = await skill.execute(params);
              return { role: "tool" as const, tool_call_id: toolCall.id, content: result };
            } catch (err: any) {
              return { role: "tool" as const, tool_call_id: toolCall.id, content: `Error: ${err.message}` };
            }
          }
          return { role: "tool" as const, tool_call_id: toolCall.id, content: `Unknown skill: ${skillName}` };
        });

        const toolResults = await Promise.all(toolPromises);
        messages.push(...toolResults);

        if (statusCallback) await statusCallback("🧠 Analyzing results...").catch(() => {});
        const finalResponse = await this.openai.chat.completions.create({
          model: this.model,
          messages,
          temperature: 0.5,
          max_tokens: 800,
        });

        assistantMessage = finalResponse.choices[0].message.content || "Done!";
      }

      user.conversationHistory.push({
        role: "assistant",
        content: assistantMessage,
        timestamp: Date.now(),
      });

      const isTradingRelated = /trade|buy|sell|swap|snipe|scan|gem|profit|loss|position|portfolio|research|trending/i.test(message);
      if (isTradingRelated) {
        this.reflect(message, assistantMessage).catch(() => {});
      }

      return assistantMessage;
    } catch (err: any) {
      console.error("🧠 Brain error:", err.message);

      if (err.message?.includes("API key")) {
        return "⚠️ My brain isn't connected yet. Add OPENAI_API_KEY to env vars to enable AI reasoning.";
      }
      return `Hmm, my brain glitched 🤔 Error: ${err.message}\n\nTry again or use a direct command.`;
    }
  }

  // ── REFLECTION LOOP ──────────────────────────────────────
  private async reflect(userMessage: string, response: string): Promise<void> {
    try {
      if (userMessage.length < 15) return;

      const reflectionPrompt = `You are an AI trading agent reflecting on an interaction.
User said: "${userMessage}"
You responded: "${response}"

In 1 sentence, what did you learn about the user's intent or preferences? If nothing notable, respond with "nothing".`;

      const result = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: reflectionPrompt }],
        temperature: 0.3,
        max_tokens: 100,
      });

      const reflection = result.choices[0].message.content || "";
      if (reflection.toLowerCase() !== "nothing" && reflection.length > 5) {
        this.agentMemory.learnings.push(`[${new Date().toISOString().slice(0, 10)}] ${reflection}`);
        if (this.agentMemory.learnings.length > 100) {
          this.agentMemory.learnings = this.agentMemory.learnings.slice(-100);
        }
        saveMemory(this.agentMemory);
      }
    } catch {
      // Reflection is non-critical
    }
  }

  // ── UTILITY ──────────────────────────────────────────────
  reloadMemory(): void {
    this.agentMemory = loadMemory();
  }

  getSkillCount(): number {
    return this.skills.getAll().length;
  }
}
