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
  maxBetsPerDay: 50, // More flexible
  maxDailyLossUsd: 500, // Higher limit
  minLiquidityUsd: 100, // Much lower - allow smaller markets
  maxVolatilityThreshold: 0.5, // 50% max volatility - more permissive
  cooldownMinutes: 1, // Shorter cooldown for fast trading
  maxPositionSizeUsd: 100, // Higher position size
  stopLossThreshold: 0.5, // 50% stop loss - less aggressive
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
  private backtestResults: BacktestResult[] = [];

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
    // Only check if market is still open (has time left)
    if (market.endDate - Date.now() < 2 * 60 * 1000) return false; // 2 minutes minimum
    
    // Optional: Skip markets with extreme volatility (but allow most)
    if (market.volatility > this.config.maxVolatilityThreshold) return false;
    
    return true; // Allow trading on any market that's still open
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

  /**
   * Run backtest against historical data to validate strategy
   */
  async runBacktest(
    historicalData: HistoricalMarketData[],
    startDate: Date,
    endDate: Date,
    initialBalance: number = 1000
  ): Promise<BacktestSummary> {
    console.log(`🔄 Running backtest from ${startDate.toDateString()} to ${endDate.toDateString()}`);
    
    let balance = initialBalance;
    let totalTrades = 0;
    let winningTrades = 0;
    let totalPnl = 0;
    const trades: BacktestTrade[] = [];
    
    // Filter data by date range
    const filteredData = historicalData.filter(
      data => data.timestamp >= startDate.getTime() && data.timestamp <= endDate.getTime()
    );
    
    // Group by market and simulate trading
    const marketGroups = this.groupByMarket(filteredData);
    
    for (const [marketId, marketHistory] of marketGroups) {
      // Skip markets with insufficient data
      if (marketHistory.length < 10) continue;
      
      // Simulate trading on this market
      const marketTrades = await this.simulateMarketTrading(marketHistory);
      
      for (const trade of marketTrades) {
        if (balance < trade.amount) continue; // Skip if insufficient balance
        
        balance -= trade.amount;
        totalTrades++;
        
        // Calculate outcome based on final price
        const finalPrice = marketHistory[marketHistory.length - 1];
        const targetPrice = trade.direction === "yes" ? finalPrice.yesPrice : finalPrice.noPrice;
        const pnl = this.calculateBacktestPnl(trade, targetPrice);
        
        balance += pnl;
        totalPnl += (pnl - trade.amount);
        
        if (pnl > trade.amount) winningTrades++;
        
        trades.push({
          ...trade,
          outcome: pnl > trade.amount ? "win" : "loss",
          pnl: pnl - trade.amount,
          finalPrice: targetPrice,
        });
      }
    }
    
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
    
    const summary: BacktestSummary = {
      startDate,
      endDate,
      initialBalance,
      finalBalance: balance,
      totalReturn,
      totalTrades,
      winningTrades,
      losingTrades: totalTrades - winningTrades,
      winRate,
      totalPnl,
      avgWin: winningTrades > 0 ? trades.filter(t => t.outcome === "win").reduce((sum, t) => sum + t.pnl, 0) / winningTrades : 0,
      avgLoss: (totalTrades - winningTrades) > 0 ? trades.filter(t => t.outcome === "loss").reduce((sum, t) => sum + t.pnl, 0) / (totalTrades - winningTrades) : 0,
      maxDrawdown: this.calculateMaxDrawdown(trades, initialBalance),
      trades,
    };
    
    this.backtestResults.push({
      timestamp: Date.now(),
      summary,
      config: { ...this.config },
    });
    
    return summary;
  }
  
  /**
   * Simulate trading on a single market's historical data
   */
  private async simulateMarketTrading(marketHistory: HistoricalMarketData[]): Promise<SimulatedTrade[]> {
    const trades: SimulatedTrade[] = [];
    
    // Look for trading opportunities in historical data
    for (let i = 5; i < marketHistory.length - 5; i++) {
      const currentData = marketHistory[i];
      const recentData = marketHistory.slice(i - 5, i);
      
      // Create market data object for analysis
      const marketData: MarketData = {
        id: currentData.marketId,
        question: currentData.question || "Historical Market",
        yesPrice: currentData.yesPrice,
        noPrice: currentData.noPrice,
        volume24h: currentData.volume24h || 1000,
        liquidity: currentData.liquidity || 5000,
        volatility: this.calculateHistoricalVolatility(recentData),
        lastUpdate: currentData.timestamp,
        category: "historical",
        endDate: currentData.endDate || Date.now() + 24 * 60 * 60 * 1000,
      };
      
      // Analyze for trading signals
      const signal = this.analyzeMarket(marketData);
      
      if (signal && signal.confidence > 0.7) {
        trades.push({
          marketId: currentData.marketId,
          direction: signal.direction,
          amount: Math.min(this.config.maxPositionSizeUsd, 20), // Conservative backtest size
          entryPrice: signal.direction === "yes" ? currentData.yesPrice : currentData.noPrice,
          timestamp: currentData.timestamp,
          confidence: signal.confidence,
          reasoning: signal.reasoning,
        });
      }
    }
    
    return trades;
  }
  
  private calculateHistoricalVolatility(data: HistoricalMarketData[]): number {
    if (data.length < 2) return 0;
    
    const prices = data.map(d => (d.yesPrice + d.noPrice) / 2);
    const returns = [];
    
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }
  
  private calculateBacktestPnl(trade: SimulatedTrade, finalPrice: number): number {
    // Simplified PnL calculation for backtesting
    const priceChange = finalPrice - trade.entryPrice;
    const multiplier = trade.direction === "yes" ? 1 : -1;
    const pnlRatio = (priceChange * multiplier) / trade.entryPrice;
    
    return trade.amount * (1 + pnlRatio);
  }
  
  private calculateMaxDrawdown(trades: BacktestTrade[], initialBalance: number): number {
    let peak = initialBalance;
    let maxDrawdown = 0;
    let currentBalance = initialBalance;
    
    for (const trade of trades) {
      currentBalance += trade.pnl;
      
      if (currentBalance > peak) {
        peak = currentBalance;
      }
      
      const drawdown = (peak - currentBalance) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    return maxDrawdown * 100; // Return as percentage
  }
  
  private groupByMarket(data: HistoricalMarketData[]): Map<string, HistoricalMarketData[]> {
    const groups = new Map<string, HistoricalMarketData[]>();
    
    for (const item of data) {
      if (!groups.has(item.marketId)) {
        groups.set(item.marketId, []);
      }
      groups.get(item.marketId)!.push(item);
    }
    
    // Sort each group by timestamp
    for (const [marketId, history] of groups) {
      history.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    return groups;
  }
  
  /**
   * Get backtest results summary
   */
  getBacktestResults(): BacktestResult[] {
    return this.backtestResults;
  }
  
  /**
   * Generate backtest report
   */
  generateBacktestReport(summary: BacktestSummary): string {
    return `📊 **Polymarket Backtest Report**

**Period:** ${summary.startDate.toDateString()} - ${summary.endDate.toDateString()}
**Initial Balance:** $${summary.initialBalance}
**Final Balance:** $${summary.finalBalance.toFixed(2)}
**Total Return:** ${summary.totalReturn.toFixed(2)}%

**Trading Performance:**
- Total Trades: ${summary.totalTrades}
- Winning Trades: ${summary.winningTrades}
- Losing Trades: ${summary.losingTrades}
- Win Rate: ${summary.winRate.toFixed(1)}%

**Risk Metrics:**
- Total P&L: $${summary.totalPnl.toFixed(2)}
- Average Win: $${summary.avgWin.toFixed(2)}
- Average Loss: $${summary.avgLoss.toFixed(2)}
- Max Drawdown: ${summary.maxDrawdown.toFixed(1)}%

**Strategy Validation:**
${summary.winRate > 55 ? "✅ Strategy shows positive edge" : "❌ Strategy needs improvement"}
${summary.maxDrawdown < 20 ? "✅ Acceptable risk levels" : "⚠️ High drawdown - reduce position sizes"}
${summary.totalTrades > 20 ? "✅ Sufficient sample size" : "⚠️ Limited sample - need more data"}`;
  }

  getStatus(): string {
    this.resetDailyStatsIfNeeded();
    
    return `**Polymarket Module Status:**
- Daily Bets: ${this.dailyStats.bets}/${this.config.maxBetsPerDay}
- Daily Losses: $${this.dailyStats.losses}/$${this.config.maxDailyLossUsd}
- Active Bets: ${this.activeBets.size}
- Last Bet: ${this.lastBetTime ? new Date(this.lastBetTime).toLocaleTimeString() : "Never"}
- Cooldown: ${this.config.cooldownMinutes} minutes
- Backtest Results: ${this.backtestResults.length} completed`;
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

export interface HistoricalMarketData {
  marketId: string;
  question?: string;
  yesPrice: number;
  noPrice: number;
  volume24h?: number;
  liquidity?: number;
  timestamp: number;
  endDate?: number;
}

export interface SimulatedTrade {
  marketId: string;
  direction: "yes" | "no";
  amount: number;
  entryPrice: number;
  timestamp: number;
  confidence: number;
  reasoning: string;
}

export interface BacktestTrade extends SimulatedTrade {
  outcome: "win" | "loss";
  pnl: number;
  finalPrice: number;
}

export interface BacktestSummary {
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  finalBalance: number;
  totalReturn: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  trades: BacktestTrade[];
}

export interface BacktestResult {
  timestamp: number;
  summary: BacktestSummary;
  config: PolymarketConfig;
}
