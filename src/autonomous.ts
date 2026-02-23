import {
  AgentMemory,
  TradeEntry,
  PolymarketTrade,
  loadMemory,
  saveMemory,
  logTrade,
  closeTrade,
  updateTokenMemory,
  getOpenPositions,
} from "./memory.js";

// ============================================================
// TYPES
// ============================================================
export type BankrPromptFn = (prompt: string, threadId?: string) => Promise<{
  success: boolean;
  jobId: string;
  threadId?: string;
  status: string;
  response?: string;
  error?: string;
}>;

export type NotifyFn = (message: string) => Promise<void>;

interface TokenCandidate {
  name: string;
  symbol: string;
  price: string;
  marketCap: number;
  volume24h: string;
  change24h: string;
  score: number;
  reason: string;
}

// ============================================================
// AUTONOMOUS TRADING ENGINE
// ============================================================
export class AutonomousTrader {
  private memory: AgentMemory;
  private bankrPrompt: BankrPromptFn;
  private notify: NotifyFn;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private polymarketTimer: ReturnType<typeof setInterval> | null = null;
  private isScanning = false;
  private isMonitoring = false;
  private polymarketStrategy: string | null = null;
  private polymarketScanIntervalMin = 15;
  private cachedPolygonBalance: number = 100;
  private balanceCacheTimestamp: number = 0;
  private balanceCacheTTL: number = 5 * 60 * 1000; // 5 minutes

  constructor(bankrPrompt: BankrPromptFn, notify: NotifyFn) {
    this.memory = loadMemory();
    this.bankrPrompt = bankrPrompt;
    this.notify = notify;
  }

  // ── START / STOP ─────────────────────────────────────────
  start(): void {
    const scanMs = this.memory.settings.scanIntervalMin * 60 * 1000;
    const monitorMs = 5 * 60 * 1000;
    const polymarketMs = this.memory.settings.scanIntervalMin * 60 * 1000;

    console.log(`🤖 Autonomous trader started (scan every ${this.memory.settings.scanIntervalMin}min)`);
    console.log(`   Auto-trade: ${this.memory.settings.autoTradeEnabled ? "ON" : "OFF"}`);
    console.log(`   Max mcap: $${this.memory.settings.maxMarketCap}`);
    console.log(`   Buy amount: $${this.memory.settings.maxBuyAmount}`);
    console.log(`   Polymarket scanning: ON`);

    this.scanTimer = setInterval(() => {
      this.scanMarket().catch(err => console.error("Scan error:", err));
    }, scanMs);

    this.monitorTimer = setInterval(() => {
      this.monitorPositions().catch(err => console.error("Monitor error:", err));
    }, monitorMs);

    // Polymarket continuous scanning DISABLED by default - requires explicit user command
    // if (this.polymarketStrategy) {
    //   this.startPolymarketLoop();
    // }
  }

  stop(): void {
    if (this.scanTimer) clearInterval(this.scanTimer);
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    if (this.polymarketTimer) clearInterval(this.polymarketTimer);
    this.polymarketStrategy = null;
    console.log("🛑 Autonomous trader stopped");
  }

  // ── POLYMARKET STRATEGY ────────────────────────────────
  setPolymarketStrategy(strategy: string, scanIntervalMin?: number): string {
    this.polymarketStrategy = strategy;
    if (scanIntervalMin) this.polymarketScanIntervalMin = scanIntervalMin;
    
    console.log(`🎯 Polymarket strategy set (manual mode)`);
    console.log(`   Strategy: ${strategy.substring(0, 100)}...`);
    
    // DO NOT auto-start the loop - require explicit user command
    // this.startPolymarketLoop(); // DISABLED
    
    // DO NOT execute immediately - wait for user command
    // this.scanPolymarket().catch(err => console.error("Polymarket scan error:", err)); // DISABLED
    
    return `🎯 Polymarket strategy saved\n\nStrategy: ${strategy.substring(0, 200)}\n\n⚠️ Auto-trading is DISABLED by default.\n\nTo scan manually, say: "scan polymarket now"\nTo enable auto-scanning, say: "start polymarket auto-scan"`;
  }

  getPolymarketStrategy(): string | null {
    return this.polymarketStrategy;
  }

  private startPolymarketLoop(): void {
    if (this.polymarketTimer) clearInterval(this.polymarketTimer);
    const ms = this.polymarketScanIntervalMin * 60 * 1000;
    this.polymarketTimer = setInterval(() => {
      this.scanPolymarket().catch(err => console.error("Polymarket scan error:", err));
    }, ms);
    console.log(`� Polymarket loop started (every ${this.polymarketScanIntervalMin}min)`);
  }

  getMemory(): AgentMemory {
    return this.memory;
  }

  reloadMemory(): void {
    this.memory = loadMemory();
  }

  // ── MARKET SCANNING ──────────────────────────────────────
  async scanMarket(): Promise<string> {
    if (this.isScanning) return "Scan already in progress...";
    this.isScanning = true;

    try {
      console.log("🔍 Autonomous scan: searching for low-cap gems...");
      const maxCap = this.memory.settings.maxMarketCap;
      const capStr = (maxCap / 1000).toFixed(0);

      const scanResult = await this.bankrPrompt(
        `Find me new and trending tokens on Base with a market cap under $${maxCap}. ` +
        `For each token, provide: name, symbol/ticker, current price, market cap, 24h volume, and 24h price change. ` +
        `Focus on tokens with real volume (>$500 24h), not dead tokens. ` +
        `List up to 10 tokens, sorted by volume. Format as a numbered list.`
      );

      if (!scanResult.success) {
        console.log("⚠️ Scan failed:", scanResult.error);
        this.isScanning = false;
        return `Scan failed: ${scanResult.error}`;
      }

      const scanResponse = scanResult.response || "";
      this.memory.lastScanTime = Date.now();
      saveMemory(this.memory);

      const candidates = await this.researchCandidates(scanResponse);

      if (candidates.length === 0) {
        console.log("📭 No viable candidates found this scan");
        this.isScanning = false;
        return "No viable candidates found under $" + capStr + "k mcap";
      }

      const viable = candidates.filter(c => c.score >= 60);

      let report = `🔍 *Market Scan Complete*\n\n`;
      report += `Found ${candidates.length} tokens under $${capStr}k mcap\n`;
      report += `${viable.length} scored 60+ (viable)\n\n`;

      for (const c of candidates.slice(0, 5)) {
        const emoji = c.score >= 70 ? "🟢" : c.score >= 50 ? "🟡" : "🔴";
        report += `${emoji} *${c.symbol}* — Score: ${c.score}/100\n`;
        report += `   Price: ${c.price} | MCap: $${c.marketCap.toLocaleString()}\n`;
        report += `   Vol: ${c.volume24h} | 24h: ${c.change24h}\n`;
        report += `   ${c.reason}\n\n`;
      }

      if (this.memory.settings.autoTradeEnabled && viable.length > 0) {
        const openPositions = getOpenPositions(this.memory);
        const slotsAvailable = this.memory.settings.maxOpenPositions - openPositions.length;

        if (slotsAvailable > 0) {
          const toBuy = viable.slice(0, slotsAvailable);
          report += `\n🎯 *Auto-buying ${toBuy.length} token(s):*\n`;

          for (const token of toBuy) {
            const buyResult = await this.executeBuy(token);
            report += `${buyResult}\n`;
          }
        } else {
          report += `\n⚠️ Max open positions (${this.memory.settings.maxOpenPositions}) reached. Skipping buys.`;
        }
      } else if (!this.memory.settings.autoTradeEnabled && viable.length > 0) {
        report += `\n💡 Auto-trade is OFF. Enable to auto-buy tokens scoring 60+.`;
      }

      await this.notify(report);
      this.isScanning = false;
      return report;
    } catch (err: any) {
      console.error("❌ Scan error:", err.message);
      this.isScanning = false;
      return `Scan error: ${err.message}`;
    }
  }

  // ── RESEARCH CANDIDATES ──────────────────────────────────
  private async researchCandidates(scanResponse: string): Promise<TokenCandidate[]> {
    const researchResult = await this.bankrPrompt(
      `Based on this token list, score each token from 0-100 on investment potential. ` +
      `Consider: volume relative to market cap, price momentum, holder distribution, liquidity depth, and risk. ` +
      `For each token, respond in this exact format (one per line):\n` +
      `SCORE|symbol|price|marketcap_number|volume24h|change24h|reason\n\n` +
      `Token list:\n${scanResponse}\n\n` +
      `Rules:\n` +
      `- Score 80+: Strong buy signal (high volume, good momentum, decent liquidity)\n` +
      `- Score 60-79: Moderate opportunity (some positive signals)\n` +
      `- Score 40-59: Risky (low liquidity or mixed signals)\n` +
      `- Score <40: Avoid (rug risk, dead volume, or declining)\n` +
      `- Be conservative. Most tokens should score below 60.`
    );

    if (!researchResult.success) return [];

    const candidates: TokenCandidate[] = [];
    const lines = (researchResult.response || "").split("\n");

    for (const line of lines) {
      const parts = line.split("|").map(s => s.trim());
      if (parts.length >= 7) {
        const score = parseInt(parts[0]);
        if (!isNaN(score)) {
          const mcap = parseFloat(parts[3].replace(/[$,k]/gi, ""));
          const marketCap = parts[3].toLowerCase().includes("k") ? mcap * 1000 : mcap;

          candidates.push({
            name: parts[1],
            symbol: parts[1],
            price: parts[2],
            marketCap: marketCap,
            volume24h: parts[4],
            change24h: parts[5],
            score,
            reason: parts[6],
          });

          this.memory = updateTokenMemory(this.memory, parts[1], {
            lastResearched: Date.now(),
            researchSummary: parts[6],
            score,
            marketCap: parts[3],
            volume24h: parts[4],
            lastPrice: parts[2],
          });
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  // ── EXECUTE BUY ──────────────────────────────────────────
  private async executeBuy(token: TokenCandidate): Promise<string> {
    const amount = this.memory.settings.maxBuyAmount;

    try {
      const result = await this.bankrPrompt(
        `Buy $${amount} of ${token.symbol} on Base`
      );

      const tradeId = `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const trade: TradeEntry = {
        id: tradeId,
        token: token.name,
        symbol: token.symbol,
        action: "buy",
        amount: `$${amount}`,
        price: token.price,
        marketCap: token.marketCap.toString(),
        timestamp: Date.now(),
        reason: `Score ${token.score}/100: ${token.reason}`,
        bankrResponse: result.response,
        status: result.success ? "open" : "failed",
      };

      this.memory = logTrade(this.memory, trade);

      if (result.success) {
        return `✅ Bought $${amount} of ${token.symbol} (score: ${token.score})`;
      } else {
        return `❌ Failed to buy ${token.symbol}: ${result.error}`;
      }
    } catch (err: any) {
      return `❌ Error buying ${token.symbol}: ${err.message}`;
    }
  }

  // ── MONITOR POSITIONS ────────────────────────────────────
  async monitorPositions(): Promise<void> {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    try {
      const openPositions = getOpenPositions(this.memory);
      if (openPositions.length === 0) {
        this.isMonitoring = false;
        return;
      }

      console.log(`📊 Monitoring ${openPositions.length} open position(s)...`);

      for (const trade of openPositions) {
        try {
          const priceResult = await this.bankrPrompt(
            `What is the current price of ${trade.symbol} on Base? Just give me the price number.`
          );

          if (!priceResult.success) continue;

          const currentPrice = priceResult.response || "";
          const entryPrice = parseFloat(trade.price || "0");
          const priceMatch = currentPrice.match(/\$?([\d.]+)/);
          const current = priceMatch ? parseFloat(priceMatch[1]) : 0;

          if (entryPrice === 0 || current === 0) continue;

          const pnlPct = ((current - entryPrice) / entryPrice) * 100;

          if (pnlPct >= this.memory.settings.takeProfitPct) {
            const sellResult = await this.bankrPrompt(
              `Sell 50% of my ${trade.symbol} position on Base`
            );

            if (sellResult.success) {
              this.memory = closeTrade(this.memory, trade.id, current.toString(), pnlPct.toFixed(2));
              await this.notify(
                `🎉 *Take Profit Hit!*\n\n` +
                `${trade.symbol}: +${pnlPct.toFixed(1)}%\n` +
                `Entry: ${trade.price} → Exit: $${current}\n` +
                `Sold 50% of position 💰`
              );
            }
          }

          if (pnlPct <= -this.memory.settings.stopLossPct) {
            const sellResult = await this.bankrPrompt(
              `Sell all of my ${trade.symbol} on Base`
            );

            if (sellResult.success) {
              this.memory = closeTrade(this.memory, trade.id, current.toString(), pnlPct.toFixed(2));
              await this.notify(
                `🛑 *Stop Loss Triggered!*\n\n` +
                `${trade.symbol}: ${pnlPct.toFixed(1)}%\n` +
                `Entry: ${trade.price} → Exit: $${current}\n` +
                `Sold all to limit losses 🛡️`
              );
            }
          }
        } catch (err: any) {
          console.error(`⚠️ Error monitoring ${trade.symbol}:`, err.message);
        }

        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (err: any) {
      console.error("❌ Monitor error:", err.message);
    }

    this.isMonitoring = false;
  }

  // ── POLYMARKET HELPERS ──────────────────────────────────
  private countConsecutiveLosses(): number {
    const trades = (this.memory.polymarketTrades || []).slice().reverse();
    let count = 0;
    for (const t of trades) {
      if (t.result === "loss") count++;
      else break;
    }
    return count;
  }

  // ── POLYMARKET SCANNING ─────────────────────────────────
  async scanPolymarket(): Promise<string> {
    if (!this.polymarketStrategy) return "No Polymarket strategy set";

    try {
      const stats = this.memory.polymarketStats || { totalBets: 0, wins: 0, losses: 0, totalPnl: 0 };
      const recentLearnings = (this.memory.polymarketLearnings || []).slice(-5).join("\n");
      
      // DYNAMIC BET SIZING based on risk management
      // Use cached balance to avoid extra Bankr call (refresh every 5 min)
      const now = Date.now();
      let polygonBalance = this.cachedPolygonBalance;
      
      if (now - this.balanceCacheTimestamp > this.balanceCacheTTL) {
        // Cache is stale — refresh balance
        console.log("🔄 Refreshing Polygon balance cache...");
        const balanceResult = await this.bankrPrompt("Show my USDC and USDC.e balance on Polygon only. Just the numbers.");
        
        if (balanceResult.success && balanceResult.response) {
          const balMatch = balanceResult.response.match(/(\d+\.?\d*)/);
          if (balMatch) {
            this.cachedPolygonBalance = parseFloat(balMatch[1]);
            this.balanceCacheTimestamp = now;
            polygonBalance = this.cachedPolygonBalance;
            console.log(`✅ Balance cache updated: $${polygonBalance.toFixed(2)}`);
          }
        }
      } else {
        console.log(`💾 Using cached balance: $${polygonBalance.toFixed(2)} (${Math.floor((this.balanceCacheTTL - (now - this.balanceCacheTimestamp)) / 60000)}min until refresh)`);
      }
      
      // Calculate win rate
      const winRate = stats.totalBets > 0 ? stats.wins / stats.totalBets : 0.5;
      
      // Detect survival mode
      const isSurvivalMode = /life\s+depends|last\s+\$|can'?t\s+lose|protect\s+capital|survive|last\s+\d+/i.test(this.polymarketStrategy);
      
      // Risk factor: how aggressive to bet
      // Survival mode = 0.5 (very conservative), Normal = 1.0, Winning streak = 1.5
      let riskFactor = 1.0;
      if (isSurvivalMode) {
        riskFactor = 0.5;
        console.log("🛡️ SURVIVAL MODE: Extra conservative bet sizing");
      } else if (winRate > 0.6 && stats.totalBets >= 5) {
        riskFactor = 1.5; // Increase bets when winning
        console.log("📈 WINNING STREAK: Increasing bet size");
      } else if (winRate < 0.4 && stats.totalBets >= 5) {
        riskFactor = 0.6; // Reduce bets when losing
        console.log("� LOSING STREAK: Reducing bet size");
      }
      
      // Kelly Criterion-inspired: bet size = balance * edge * risk_factor
      // Edge = win_rate - 0.5 (how much better than 50/50)
      // Cap at 5% of balance per bet for safety
      const edge = Math.max(0.1, winRate - 0.5); // Minimum 0.1 edge assumption
      let perTradeAmount = Math.floor(polygonBalance * edge * riskFactor);
      perTradeAmount = Math.max(1, Math.min(perTradeAmount, polygonBalance * 0.05)); // Min $1, max 5% of balance
      
      console.log("🎯 Autonomous Polymarket scan: executing strategy...");
      console.log(`   Polygon balance: $${polygonBalance.toFixed(2)}`);
      console.log(`   Win rate: ${(winRate * 100).toFixed(0)}% | Edge: ${(edge * 100).toFixed(0)}%`);
      console.log(`   Risk factor: ${riskFactor.toFixed(1)}x`);
      console.log(`   Calculated bet: $${perTradeAmount}`);

      // Loss streak protection: reduce bet or skip after consecutive losses
      const recentTrades = (this.memory.polymarketTrades || []).slice(-5);
      const recentLosses = recentTrades.filter(t => t.result === "loss").length;
      const consecutiveLosses = this.countConsecutiveLosses();
      
      let adjustedAmount = perTradeAmount;
      let skipMessage = "";
      
      if (consecutiveLosses >= 4) {
        // 4+ losses in a row — pause and skip this scan
        console.log("⚠️ 4+ consecutive losses — skipping this scan to protect capital");
        await this.notify("⚠️ *Polymarket Auto-Trade: PAUSED*\n\n4+ consecutive losses detected. Skipping this scan to protect capital. Will resume next cycle with fresh analysis.");
        return "Skipped: 4+ consecutive losses — protecting capital";
      } else if (consecutiveLosses >= 2) {
        // 2-3 losses — reduce bet size by half
        adjustedAmount = Math.max(1, Math.floor(perTradeAmount / 2));
        skipMessage = `\n⚠️ CAUTION: ${consecutiveLosses} consecutive losses. Bet reduced to $${adjustedAmount}. Be extra selective.`;
      }

      const scanResult = await this.bankrPrompt(
        `EXECUTE NOW — ONE-SHOT TRADE. Do NOT schedule or create recurring commands. Just find a market and place ONE bet right now.\n\n` +
        `Search Polymarket for the best opportunity matching this strategy: ${this.polymarketStrategy}\n\n` +
        `BET AMOUNT: $${adjustedAmount}${skipMessage}\n\n` +
        `MY TRACK RECORD:\n` +
        `- ${stats.totalBets} bets so far | ${stats.wins}W/${stats.losses}L | Win rate: ${stats.totalBets > 0 ? ((stats.wins / stats.totalBets) * 100).toFixed(0) : "N/A"}%\n` +
        `- P&L: $${stats.totalPnl.toFixed(2)} | Consecutive losses: ${consecutiveLosses}\n` +
        `- Learnings:\n${recentLearnings || "First scan — no learnings yet."}\n\n` +
        `STRICT CONSTRAINTS:\n` +
        `- ONLY use funds on Polygon. Use USDC, USDC.e, or any available stablecoin on Polygon for bets.\n` +
        `- Do NOT swap tokens. Do NOT bridge from other chains. Do NOT touch Base, Solana, or Ethereum funds.\n` +
        `- If you have ANY USDC or USDC.e on Polygon (even $1), USE IT. Don't skip due to "insufficient balance" unless truly $0.\n` +
        `- ONLY action allowed: place a Polymarket bet using existing Polygon funds. No swaps, no bridges.\n\n` +
        `RULES:\n` +
        `1. Find ONE market right now with a clear edge (odds > 55% one side, or strong momentum)\n` +
        `2. If all markets are ~50/50 (45-55%), respond with "SKIP: No clear edge found" — do NOT force a bad bet\n` +
        `3. If you find an edge, PLACE THE BET for $${adjustedAmount} immediately using Polygon USDC or USDC.e\n` +
        `4. Bet WITH momentum/trend, not against it\n` +
        `5. Report: market name, side, odds, edge reasoning, amount\n` +
        `6. Do NOT schedule anything. Do NOT create recurring tasks. Do NOT swap or bridge. Just place ONE bet NOW.`
      );

      if (!scanResult.success) {
        console.log("⚠️ Polymarket scan failed:", scanResult.error);
        return `Polymarket scan failed: ${scanResult.error}`;
      }

      const response = scanResult.response || "No results";
      console.log(`🎯 Polymarket scan result: ${response.substring(0, 150)}...`);

      // Check if Bankr decided to SKIP (no edge found)
      const isSkip = response.toUpperCase().includes("SKIP:");
      
      if (isSkip) {
        console.log("⏭️ Polymarket scan: No edge found, skipping this cycle");
        await this.notify(`⏭️ *Polymarket Scan — Skipped*\n\n${response}\n\n_Waiting for better opportunity next cycle._`);
        return response;
      }

      // Log the actual trade to memory
      const trade: PolymarketTrade = {
        id: `pm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        market: response.substring(0, 100),
        outcome: "pending",
        amount: String(adjustedAmount),
        odds: "see response",
        timestamp: Date.now(),
        result: "pending",
        bankrResponse: response,
      };
      
      if (!this.memory.polymarketTrades) this.memory.polymarketTrades = [];
      this.memory.polymarketTrades.push(trade);
      if (!this.memory.polymarketStats) {
        this.memory.polymarketStats = { totalBets: 0, wins: 0, losses: 0, totalPnl: 0, bestStrategy: "", worstStrategy: "" };
      }
      this.memory.polymarketStats.totalBets++;
      saveMemory(this.memory);

      // Refine strategy — learn from this scan
      await this.refinePolymarketStrategy(response);

      await this.notify(
        `🎯 *Polymarket Auto-Trade #${stats.totalBets + 1}*\n\n${response}`
      );

      return response;
    } catch (err: any) {
      console.error("❌ Polymarket scan error:", err.message);
      return `Polymarket scan error: ${err.message}`;
    }
  }

  // ── POLYMARKET STRATEGY REFINEMENT ─────────────────────
  private async refinePolymarketStrategy(lastResult: string): Promise<void> {
    try {
      const stats = this.memory.polymarketStats;
      const recentTrades = (this.memory.polymarketTrades || []).slice(-5);
      
      const winRate = stats.totalBets > 0 ? ((stats.wins / stats.totalBets) * 100).toFixed(0) : "N/A";
      const recentTradesSummary = recentTrades.map(t => 
        `${t.market.substring(0, 50)} → ${t.result}`
      ).join("\n") || "No trades yet";

      const refinementResult = await this.bankrPrompt(
        `You are an AI trading agent reflecting on your Polymarket performance.\n\n` +
        `CURRENT STRATEGY: ${this.polymarketStrategy}\n` +
        `STATS: ${stats.totalBets} bets, ${stats.wins}W/${stats.losses}L, Win rate: ${winRate}%, P&L: $${stats.totalPnl.toFixed(2)}\n` +
        `RECENT TRADES:\n${recentTradesSummary}\n` +
        `LAST RESULT: ${lastResult.substring(0, 300)}\n\n` +
        `In 1-2 sentences, give a SPECIFIC actionable adjustment:\n` +
        `- Which specific markets/assets performed best?\n` +
        `- Should we switch sides (Up vs Down)?\n` +
        `- Should we avoid certain markets entirely?\n` +
        `- Is there a pattern in wins vs losses?\n` +
        `Be concrete: "Bet on XRP Down instead of Up" not "consider adjusting".`
      );

      if (refinementResult.success && refinementResult.response) {
        const learning = `[${new Date().toISOString().slice(0, 16)}] ${refinementResult.response}`;
        if (!this.memory.polymarketLearnings) this.memory.polymarketLearnings = [];
        this.memory.polymarketLearnings.push(learning);
        
        // Keep last 20 learnings
        if (this.memory.polymarketLearnings.length > 20) {
          this.memory.polymarketLearnings = this.memory.polymarketLearnings.slice(-20);
        }
        
        saveMemory(this.memory);
        console.log(`🧠 Polymarket learning: ${refinementResult.response.substring(0, 100)}`);
      }
    } catch {
      // Refinement is non-critical
    }
  }

  // ── MANUAL ACTIONS ───────────────────────────────────────
  async manualResearch(token: string): Promise<string> {
    const result = await this.bankrPrompt(
      `Give me a comprehensive analysis of ${token} on Base:\n` +
      `1. Current price and market cap\n` +
      `2. 24h volume and price change\n` +
      `3. Holder distribution (top holders %)\n` +
      `4. Liquidity depth\n` +
      `5. Social sentiment\n` +
      `6. Risk assessment (1-10)\n` +
      `7. Overall investment score (0-100)\n` +
      `Be honest and conservative in your assessment.`
    );

    if (result.success) {
      this.memory = updateTokenMemory(this.memory, token.toUpperCase(), {
        lastResearched: Date.now(),
        researchSummary: result.response || "",
      });
    }

    return result.success ? result.response || "No data" : `Research failed: ${result.error}`;
  }

  // ── SETTINGS ─────────────────────────────────────────────
  updateSettings(updates: Partial<AgentMemory["settings"]>): string {
    Object.assign(this.memory.settings, updates);
    saveMemory(this.memory);

    if (updates.scanIntervalMin && this.scanTimer) {
      clearInterval(this.scanTimer);
      const scanMs = this.memory.settings.scanIntervalMin * 60 * 1000;
      this.scanTimer = setInterval(() => this.scanMarket(), scanMs);
    }

    return "Settings updated ✅";
  }

  toggleAutoTrade(enabled: boolean): string {
    this.memory.settings.autoTradeEnabled = enabled;
    saveMemory(this.memory);
    return enabled
      ? "🟢 Auto-trade ENABLED. I'll buy tokens that score 60+ automatically."
      : "🔴 Auto-trade DISABLED. I'll still scan and alert you, but won't buy.";
  }
}
