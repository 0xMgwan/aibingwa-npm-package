/**
 * Dedicated Polymarket module for 5-minute directional trading
 * Optimized for fast markets with strict timing and risk controls
 */

export interface PolymarketConfig {
  maxBetsPerDay: number;
  maxDailyLossUsd: number;
  minLiquidityUsd: number;
  maxVolatilityThreshold: number;
  cooldownMinutes: number;
  maxPositionSizeUsd: number;
  stopLossThreshold: number;
}

export const DEFAULT_POLYMARKET_CONFIG: PolymarketConfig = {
  maxBetsPerDay: 10,
  maxDailyLossUsd: 50,
  minLiquidityUsd: 1000,
  maxVolatilityThreshold: 0.15, // 15% max volatility
  cooldownMinutes: 5,
  maxPositionSizeUsd: 10,
  stopLossThreshold: 0.25, // 25% stop loss
};

export interface MarketData {
  id: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  liquidity: number;
  volatility: number;
  lastUpdate: number;
  category: string;
  endDate: number;
}

export interface TradingSignal {
  marketId: string;
  direction: "yes" | "no";
  confidence: number; // 0-1
  reasoning: string;
  urgency: "low" | "medium" | "high";
  expectedDuration: number; // minutes
}

export class PolymarketModule {
  private config: PolymarketConfig;
  private dailyStats = {
    bets: 0,
    losses: 0,
    lastResetDate: new Date().toDateString(),
  };
  private activeBets: Map<string, ActiveBet> = new Map();
  private lastBetTime = 0;

  constructor(config: PolymarketConfig = DEFAULT_POLYMARKET_CONFIG) {
    this.config = config;
  }

  /**
   * Scan markets for 5-minute directional opportunities
   */
  async scanForOpportunities(): Promise<TradingSignal[]> {
    const markets = await this.fetchActiveMarkets();
    const signals: TradingSignal[] = [];

    for (const market of markets) {
      if (!this.passesPreScreening(market)) continue;

      const signal = this.analyzeMarket(market);
      if (signal && signal.confidence > 0.6) {
        signals.push(signal);
      }
    }

    return signals.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Execute a bet with all safety checks
   */
  async executeBet(
    signal: TradingSignal,
    amountUsd: number,
    executeCallback: (marketId: string, direction: string, amount: number) => Promise<BetResult>
  ): Promise<string> {
    // Safety checks
    const safetyCheck = this.performSafetyChecks(amountUsd);
    if (!safetyCheck.allowed) {
      return `❌ Bet blocked: ${safetyCheck.reason}`;
    }

    // Cooldown check
    const now = Date.now();
    if (now - this.lastBetTime < this.config.cooldownMinutes * 60 * 1000) {
      const remainingMinutes = Math.ceil(
        (this.config.cooldownMinutes * 60 * 1000 - (now - this.lastBetTime)) / 60000
      );
      return `⏳ Cooldown active: ${remainingMinutes} minutes remaining`;
    }

    try {
      const result = await executeCallback(signal.marketId, signal.direction, amountUsd);
      
      if (result.success) {
        this.recordBet(signal, amountUsd, result);
        this.lastBetTime = now;
        return this.formatBetSuccess(signal, amountUsd, result);
      } else {
        return `❌ Bet failed: ${result.error}`;
      }
    } catch (error) {
      return `❌ Bet execution error: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  /**
   * Monitor active bets and trigger stop losses
   */
  async monitorActiveBets(
    updateCallback: (marketId: string) => Promise<MarketData>
  ): Promise<string[]> {
    const alerts: string[] = [];

    for (const [marketId, bet] of this.activeBets) {
      try {
        const currentData = await updateCallback(marketId);
        const currentPrice = bet.direction === "yes" ? currentData.yesPrice : currentData.noPrice;
        
        const pnlPercent = ((currentPrice - bet.entryPrice) / bet.entryPrice) * 100;
        
        // Check stop loss
        if (Math.abs(pnlPercent) >= this.config.stopLossThreshold * 100) {
          alerts.push(`🚨 Stop loss triggered for ${bet.marketId}: ${pnlPercent.toFixed(1)}% loss`);
          this.activeBets.delete(marketId);
        }
        
        // Check if market is about to close
        const timeToClose = currentData.endDate - Date.now();
        if (timeToClose < 5 * 60 * 1000) { // 5 minutes
          alerts.push(`⏰ Market ${bet.marketId} closing in ${Math.round(timeToClose / 60000)} minutes`);
        }
      } catch (error) {
        alerts.push(`❌ Error monitoring ${marketId}: ${error instanceof Error ? error.message : "Unknown"}`);
      }
    }

    return alerts;
  }

  /**
   * Pre-screening filters for market quality
   */
  private passesPreScreening(market: MarketData): boolean {
    // Liquidity check
    if (market.liquidity < this.config.minLiquidityUsd) return false;
    
    // Volatility check (too volatile = unpredictable)
    if (market.volatility > this.config.maxVolatilityThreshold) return false;
    
    // Time check (must have at least 10 minutes left)
    if (market.endDate - Date.now() < 10 * 60 * 1000) return false;
    
    // Volume check (must have recent activity)
    if (market.volume24h < 100) return false;
    
    return true;
  }

  /**
   * Analyze market for directional signals
   */
  private analyzeMarket(market: MarketData): TradingSignal | null {
    const { yesPrice, noPrice, volatility, volume24h } = market;
    
    // Look for price inefficiencies
    const priceSum = yesPrice + noPrice;
    const priceImbalance = Math.abs(priceSum - 1.0);
    
    // Momentum analysis (simplified)
    const momentum = this.calculateMomentum(market);
    
    // Volume-price analysis
    const volumeSignal = this.analyzeVolumePrice(market);
    
    let confidence = 0;
    let direction: "yes" | "no" = "yes";
    let reasoning = "";
    
    // Price inefficiency signal
    if (priceImbalance > 0.05) {
      confidence += 0.3;
      reasoning += `Price inefficiency detected (${(priceImbalance * 100).toFixed(1)}%). `;
    }
    
    // Momentum signal
    if (Math.abs(momentum) > 0.1) {
      confidence += 0.4;
      direction = momentum > 0 ? "yes" : "no";
      reasoning += `Strong momentum ${momentum > 0 ? "upward" : "downward"} (${(momentum * 100).toFixed(1)}%). `;
    }
    
    // Volume signal
    if (volumeSignal.strength > 0.2) {
      confidence += 0.3;
      reasoning += `Volume analysis supports ${volumeSignal.direction} direction. `;
    }
    
    if (confidence < 0.5) return null;
    
    return {
      marketId: market.id,
      direction,
      confidence: Math.min(confidence, 0.95), // Cap at 95%
      reasoning: reasoning.trim(),
      urgency: confidence > 0.8 ? "high" : confidence > 0.65 ? "medium" : "low",
      expectedDuration: 5, // 5-minute trades
    };
  }

  private calculateMomentum(market: MarketData): number {
    // Simplified momentum calculation
    // In real implementation, you'd use historical price data
    const midPrice = (market.yesPrice + market.noPrice) / 2;
    return (midPrice - 0.5) * 2; // Normalize to -1 to 1
  }

  private analyzeVolumePrice(market: MarketData): { direction: "yes" | "no"; strength: number } {
    // Simplified volume-price analysis
    const volumeRatio = market.volume24h / (market.liquidity || 1);
    const priceSkew = market.yesPrice - 0.5;
    
    return {
      direction: priceSkew > 0 ? "yes" : "no",
      strength: Math.min(volumeRatio * Math.abs(priceSkew), 1),
    };
  }

  private performSafetyChecks(amountUsd: number): { allowed: boolean; reason?: string } {
    this.resetDailyStatsIfNeeded();
    
    // Daily bet limit
    if (this.dailyStats.bets >= this.config.maxBetsPerDay) {
      return { allowed: false, reason: `Daily bet limit reached (${this.config.maxBetsPerDay})` };
    }
    
    // Daily loss limit
    if (this.dailyStats.losses >= this.config.maxDailyLossUsd) {
      return { allowed: false, reason: `Daily loss limit reached ($${this.config.maxDailyLossUsd})` };
    }
    
    // Position size limit
    if (amountUsd > this.config.maxPositionSizeUsd) {
      return { allowed: false, reason: `Position size $${amountUsd} exceeds limit of $${this.config.maxPositionSizeUsd}` };
    }
    
    return { allowed: true };
  }

  private recordBet(signal: TradingSignal, amountUsd: number, result: BetResult): void {
    this.resetDailyStatsIfNeeded();
    this.dailyStats.bets++;
    
    const activeBet: ActiveBet = {
      marketId: signal.marketId,
      direction: signal.direction,
      amountUsd,
      entryPrice: signal.direction === "yes" ? result.yesPrice || 0 : result.noPrice || 0,
      timestamp: Date.now(),
      reasoning: signal.reasoning,
    };
    
    this.activeBets.set(signal.marketId, activeBet);
  }

  private resetDailyStatsIfNeeded(): void {
    const today = new Date().toDateString();
    if (today !== this.dailyStats.lastResetDate) {
      this.dailyStats.bets = 0;
      this.dailyStats.losses = 0;
      this.dailyStats.lastResetDate = today;
    }
  }

  private formatBetSuccess(signal: TradingSignal, amountUsd: number, result: BetResult): string {
    return `✅ **POLYMARKET BET EXECUTED**

**Market:** ${signal.marketId}
**Direction:** ${signal.direction.toUpperCase()}
**Amount:** $${amountUsd}
**Price:** ${signal.direction === "yes" ? result.yesPrice?.toFixed(3) : result.noPrice?.toFixed(3)}
**Confidence:** ${(signal.confidence * 100).toFixed(1)}%
**Reasoning:** ${signal.reasoning}

**Transaction:** ${result.txHash || "Pending"}
**Expected Duration:** ${signal.expectedDuration} minutes`;
  }

  private async fetchActiveMarkets(): Promise<MarketData[]> {
    // Mock implementation - replace with actual Polymarket API calls
    return [
      {
        id: "crypto-btc-100k-eoy",
        question: "Will Bitcoin reach $100k by end of year?",
        yesPrice: 0.65,
        noPrice: 0.35,
        volume24h: 5000,
        liquidity: 15000,
        volatility: 0.08,
        lastUpdate: Date.now(),
        category: "crypto",
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    ];
  }

  getStatus(): string {
    this.resetDailyStatsIfNeeded();
    
    return `**Polymarket Module Status:**
- Daily Bets: ${this.dailyStats.bets}/${this.config.maxBetsPerDay}
- Daily Losses: $${this.dailyStats.losses}/$${this.config.maxDailyLossUsd}
- Active Bets: ${this.activeBets.size}
- Last Bet: ${this.lastBetTime ? new Date(this.lastBetTime).toLocaleTimeString() : "Never"}
- Cooldown: ${this.config.cooldownMinutes} minutes`;
  }
}

interface ActiveBet {
  marketId: string;
  direction: "yes" | "no";
  amountUsd: number;
  entryPrice: number;
  timestamp: number;
  reasoning: string;
}

interface BetResult {
  success: boolean;
  txHash?: string;
  yesPrice?: number;
  noPrice?: number;
  error?: string;
}
