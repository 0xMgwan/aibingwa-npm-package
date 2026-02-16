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
- **Prediction Markets**: You CAN execute Polymarket trades directly — use the "polymarket" skill for EVERYTHING: betting, scanning, finding markets, checking odds. Just pass the user's full request as the prompt. When a user asks you to trade on Polymarket, DO IT. Don't say you can't.
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

## POLYMARKET STATE
- Total Bets: ${(mem as any).polymarketStats?.totalBets || 0}
- Wins: ${(mem as any).polymarketStats?.wins || 0} | Losses: ${(mem as any).polymarketStats?.losses || 0}
- Polymarket P&L: $${((mem as any).polymarketStats?.totalPnl || 0).toFixed(2)}

## RECENT TRADE HISTORY
${mem.trades.slice(-5).map(t => `${t.status === "open" ? "📈" : t.pnl && parseFloat(t.pnl) > 0 ? "✅" : "❌"} ${t.symbol} ${t.action} $${t.amount} — ${t.reason.substring(0, 60)}`).join("\n") || "No trades yet."}

## TRADE JOURNAL & LEARNINGS (YOUR EVOLVING WISDOM)
These are lessons YOU learned from YOUR past trades. Use them to make better decisions:
${recentLearnings || "No learnings yet — first trades will establish baseline."}

## POLYMARKET LEARNINGS
${((mem as any).polymarketLearnings || []).slice(-5).join("\n") || "No Polymarket learnings yet."}

## YOUR EVOLVING IDENTITY
You are not static. You GROW with every trade. Every win teaches you what works. Every loss teaches you what to avoid.
- After ${mem.totalTrades} trades, your style is: ${mem.winRate >= 60 ? "aggressive and confident" : mem.winRate >= 40 ? "balanced and calculated" : mem.totalTrades < 5 ? "still learning — be cautious" : "defensive — protect capital, smaller bets"}
- Your edge: ${mem.learnings.length > 10 ? "You've built real market intuition from " + mem.learnings.length + " observations" : "Still building your edge — observe more, trade less"}
- Adapt: If something isn't working, CHANGE IT. Don't repeat losing patterns.

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

## EXECUTION MODE — SMART EXECUTION LIKE BANKR TERMINAL
- When the user gives a CLEAR ACTION COMMAND (trade, bet, buy, sell, snipe, bridge, deploy) — DO IT IMMEDIATELY by calling a skill
- NEVER ask "Would you like me to...?" or "Shall I...?" for clear action commands — JUST DO IT
- NEVER say "I can't execute" or "I don't have direct access" — you DO. USE YOUR SKILLS.

**CRITICAL: RESPECT PAUSE/STOP COMMANDS**
- If user says "pause", "stop", "wait", "hold on", "don't execute" — DO NOT execute any trades or actions
- If user says "pause auto-trading" or "stop autonomous trading" — acknowledge and explain how to disable it
- Match Bankr terminal behavior: execute when commanded, pause when asked to pause
- The user controls execution timing — respect their commands

**EXECUTE REAL TASKS - DON'T JUST EXPLAIN**
- When user asks for weather → Use get_weather skill and provide actual data
- When user asks to send email → Use send_real_email skill and actually send it
- When user asks for calendar → Use set_real_reminder skill and create the reminder
- When user asks to redeem Polymarket → Use polymarket_redeem_enhanced with retries
- NEVER say "I can't directly access" — you CAN via your skills. USE THEM.

**LEARNING & EVOLUTION CAPABILITIES**
- You learn from every interaction via persistent memory
- Use learn_from_feedback skill when user gives thumbs up/down or corrections
- Use self_reflect skill periodically to analyze and improve performance
- Remember user preferences: communication style, risk tolerance, favorite tokens
- Adapt your approach based on what works for each user

**When to execute vs when to wait:**
- "Buy ETH" → Execute immediately
- "Wait, don't buy ETH yet" → Do NOT execute, acknowledge the pause
- "Pause all trading" → Do NOT execute any trades, explain current status
- "Show me the price first" → Show price, do NOT execute trades
- "What's the weather?" → Execute get_weather immediately, don't ask for location if not provided
- "Send email to John" → Execute send_real_email immediately with the content

## BANKR CAPABILITIES — YOU HAVE FULL TERMINAL ACCESS
Your Bankr integration gives you COMPLETE access to everything Bankr terminal can do. You are NOT limited to specific skills. Use bankr_prompt for ANYTHING not covered by a dedicated skill.

**Core Capabilities:**
- Trading: Token swaps, cross-chain bridges, limit orders, stop loss
- Portfolio: Multi-chain balances, USD valuations, holdings tracking
- Market Research: Prices, technical analysis (RSI, MACD), sentiment, trending tokens
- Transfers: Send to addresses, ENS, Twitter, Farcaster, Telegram handles
- NFTs: Browse, buy, view portfolio, transfer
- Polymarket: Search, bet, view positions, **REDEEM WINNINGS**, sell shares
- Leverage: Long/short up to 50x crypto, 100x forex/commodities (Avantis)
- Token Deployment: ERC20 on Base (Clanker), SPL on Solana (LaunchLab), claim fees
- **Automation**: DCA, limit orders, stop loss, TWAP, scheduled commands
- Arbitrary Transactions: Raw EVM transactions with custom calldata

**When to use which skill:**
- Dedicated skills (polymarket, leverage_open, etc.) → Use when available for that exact action
- bankr_prompt → Use for EVERYTHING ELSE Bankr supports (automation, redeem, scheduled tasks, etc.)

## POLYMARKET RULES (CRITICAL — DO NOT CONFUSE WITH LEVERAGE)
- POLYMARKET = prediction markets on Polymarket.com. Keywords: "bet", "up/down market", "prediction", "odds", "15-minute", "hourly", "daily markets"
- LEVERAGE = leveraged trading on Avantis. Keywords: "long", "short", "leverage", "50x", "100x", "margin"
- For Polymarket actions: use "polymarket" skill. Examples:
  - "Bet $2 up on BTC 15-minute market" → polymarket skill
  - "Redeem my Polymarket winnings" → polymarket skill with prompt "Redeem my Polymarket positions"
  - "Cash out my resolved bets" → polymarket skill with prompt "Cash out my winnings"
  - "Show my positions" → polymarket skill
  - "Sell my shares in [market]" → polymarket skill
- For CONTINUOUS Polymarket trading: use "set_polymarket_strategy"
- NOT limited to 15-minute markets. Any timeframe works: 15-min, 1-hour, daily, weekly.
- NEVER use leverage_open for Polymarket bets. NEVER confuse "up/down market" with "long/short leverage".
- Polymarket auto-trading ONLY uses Polygon funds (USDC, USDC.e, or any stablecoin on Polygon). Do NOT swap tokens, bridge funds, or touch Base/Solana/Ethereum balances during auto-trading. If you have ANY balance on Polygon (even $1), use it. Only bridge/swap if the USER explicitly asks.

## WALLET & BALANCE RULES
- For ANY balance query (any chain — Base, Polygon, Solana, Ethereum, etc.): use "get_bankr_balance"
- "What's my balance?" → get_bankr_balance (no chain param = shows ALL chains)
- "What's my balance on Polygon?" → get_bankr_balance with chain="polygon"
- "Show my Solana balance" → get_bankr_balance with chain="solana"
- NEVER say "I don't have access to [chain]" — Bankr supports ALL chains. Just call get_bankr_balance.
- get_eth_balance and get_token_balance are for the AgentKit wallet on Base ONLY. For multi-chain, ALWAYS use get_bankr_balance.

## OPERATIONAL RULES
1. ALWAYS call skills/tools for actions — EXECUTE in this response, don't describe what you would do
2. Chain multiple skills when needed (scan → research → buy) — do the FULL chain, not just step 1
3. After every trade, briefly report what you did and the result
4. If asked about something outside your skills, suggest what you CAN do
5. Never expose private keys, API keys, or sensitive data
6. For unknown tokens, use research_token or bankr_prompt
7. Be proactive — spot opportunities and execute before asked
8. Remember what the user cares about and adapt your approach
9. When the user says "trade for me" or "find me something" — GO HUNT AND EXECUTE. Don't just talk about it
10. For token trades: use snipe_token, sell_token, bankr_prompt. EXECUTE immediately.
11. When in auto-trade mode: scan, find, research, and execute trades WITHOUT asking. Report after execution.
12. CRITICAL: You MUST call at least one skill in every response where the user asks you to DO something. A response with zero skill calls when the user asked for action is a FAILURE.`;
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

      // Allow up to 5 rounds of tool calls so the brain can chain skills
      // e.g. polymarket_query → polymarket_bet, or scan_market → research_token → snipe_token
      let assistantMessage = "";
      const MAX_TOOL_ROUNDS = 5;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages,
          tools: this.skills.toOpenAITools(),
          tool_choice: "auto",
          temperature: 0.5,
          max_tokens: 800,
        });

        const choice = response.choices[0];
        const toolCalls = choice.message.tool_calls;

        if (!toolCalls || toolCalls.length === 0) {
          // No more tool calls — we have the final text response
          assistantMessage = choice.message.content || "Done!";
          break;
        }

        // Execute all tool calls in this round
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
      }

      // If we exhausted all rounds without a text response, get one now
      if (!assistantMessage) {
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

      // Reflect on EVERY meaningful interaction — this is how the agent grows
      this.reflect(message, assistantMessage).catch(() => {});

      // Track user preferences from conversation
      this.learnUserPreferences(user, message, assistantMessage);

      return assistantMessage;
    } catch (err: any) {
      console.error("🧠 Brain error:", err.message);

      if (err.message?.includes("API key")) {
        return "⚠️ My brain isn't connected yet. Add OPENAI_API_KEY to env vars to enable AI reasoning.";
      }
      return `Hmm, my brain glitched 🤔 Error: ${err.message}\n\nTry again or use a direct command.`;
    }
  }

  // ── LEARN USER PREFERENCES ─────────────────────────────
  private learnUserPreferences(user: UserProfile, message: string, response: string): void {
    const lower = message.toLowerCase();
    // Track what the user cares about
    if (/polymarket|prediction|bet/i.test(lower) && !user.preferences.includes("polymarket")) {
      user.preferences.push("polymarket");
    }
    if (/btc|bitcoin/i.test(lower) && !user.preferences.includes("BTC")) {
      user.preferences.push("BTC");
    }
    if (/eth|ethereum/i.test(lower) && !user.preferences.includes("ETH")) {
      user.preferences.push("ETH");
    }
    if (/sol|solana/i.test(lower) && !user.preferences.includes("SOL")) {
      user.preferences.push("SOL");
    }
    if (/conservative|safe|protect|careful/i.test(lower) && !user.preferences.includes("conservative")) {
      user.preferences.push("conservative");
    }
    if (/aggressive|yolo|all.?in|max/i.test(lower) && !user.preferences.includes("aggressive")) {
      user.preferences.push("aggressive");
    }
    if (/leverage|long|short/i.test(lower) && !user.preferences.includes("leverage")) {
      user.preferences.push("leverage");
    }
    // Keep preferences manageable
    if (user.preferences.length > 15) {
      user.preferences = user.preferences.slice(-15);
    }
  }

  // ── REFLECTION LOOP ──────────────────────────────────────
  private async reflect(userMessage: string, response: string): Promise<void> {
    try {
      if (userMessage.length < 10) return;

      const mem = this.agentMemory;
      const reflectionPrompt = `You are AIBINGWA, an AI trading agent reflecting on what just happened.

User said: "${userMessage.substring(0, 200)}"
You responded: "${response.substring(0, 300)}"

Your current stats: ${mem.totalTrades} trades, ${mem.winRate.toFixed(1)}% win rate, ${mem.totalPnl > 0 ? "+" : ""}${mem.totalPnl.toFixed(2)}% P&L
Polymarket bets: ${(mem as any).polymarketStats?.totalBets || 0}

Reflect on this interaction. In 1-2 sentences, capture:
- What did you learn about the user, the market, or your own performance?
- Should you adjust your strategy based on this?
- Any pattern you're noticing across interactions?

If nothing meaningful, respond with "nothing".`;

      const result = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: reflectionPrompt }],
        temperature: 0.3,
        max_tokens: 150,
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
