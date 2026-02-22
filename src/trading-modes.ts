/**
 * Trading modes for AIBINGWA agent
 * Provides paper/confirm/live trading with safe defaults
 */

export type TradingMode = "paper" | "confirm" | "live";

export interface TradingConfig {
  mode: TradingMode;
  autoTradeEnabled: boolean;
  requireConfirmation: boolean;
  simulateOnly: boolean;
}

export const TRADING_MODES: Record<TradingMode, TradingConfig> = {
  paper: {
    mode: "paper",
    autoTradeEnabled: true,
    requireConfirmation: false,
    simulateOnly: true,
  },
  confirm: {
    mode: "confirm",
    autoTradeEnabled: false,
    requireConfirmation: true,
    simulateOnly: false,
  },
  live: {
    mode: "live",
    autoTradeEnabled: true,
    requireConfirmation: false,
    simulateOnly: false,
  },
};

export class TradingModeManager {
  private currentMode: TradingMode = "paper"; // Safe default
  private pendingTrades: Map<string, PendingTrade> = new Map();

  constructor(initialMode: TradingMode = "paper") {
    this.currentMode = initialMode;
  }

  getCurrentMode(): TradingMode {
    return this.currentMode;
  }

  getConfig(): TradingConfig {
    return TRADING_MODES[this.currentMode];
  }

  setMode(mode: TradingMode): string {
    this.currentMode = mode;
    const config = TRADING_MODES[mode];
    
    switch (mode) {
      case "paper":
        return `📝 **Paper Trading Mode Activated**
- All trades are simulated
- No real money at risk
- Perfect for testing strategies
- Auto-trading: ${config.autoTradeEnabled ? "ON" : "OFF"}`;

      case "confirm":
        return `⚠️ **Confirmation Mode Activated**
- Real trades require your approval
- I'll propose trades and wait for "YES" or "NO"
- Safe for beginners
- Auto-trading: ${config.autoTradeEnabled ? "ON" : "OFF"}`;

      case "live":
        return `🚨 **LIVE Trading Mode Activated**
- Real trades with real money
- Immediate execution without confirmation
- Use with caution!
- Auto-trading: ${config.autoTradeEnabled ? "ON" : "OFF"}`;

      default:
        return "Unknown trading mode";
    }
  }

  /**
   * Process a trade based on current mode
   */
  async processTrade(
    tradeParams: TradeParams,
    executeCallback: (params: TradeParams) => Promise<TradeResult>
  ): Promise<string> {
    const config = this.getConfig();

    if (config.simulateOnly) {
      return this.simulateTrade(tradeParams);
    }

    if (config.requireConfirmation) {
      return this.requestConfirmation(tradeParams);
    }

    // Live mode - execute immediately
    try {
      const result = await executeCallback(tradeParams);
      return this.formatTradeResult(result);
    } catch (error) {
      return `❌ Trade failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  /**
   * Simulate a trade for paper mode
   */
  private simulateTrade(params: TradeParams): string {
    const { action, symbol, amount, price } = params;
    const totalValue = amount * (price || 0);

    return `📝 **PAPER TRADE SIMULATED**

**Action:** ${action.toUpperCase()}
**Symbol:** ${symbol}
**Amount:** ${amount}
**Price:** $${price?.toFixed(4) || "MARKET"}
**Total Value:** $${totalValue.toFixed(2)}

✅ Trade logged in paper portfolio
💡 Switch to "confirm" or "live" mode for real trades`;
  }

  /**
   * Request confirmation for a trade
   */
  private requestConfirmation(params: TradeParams): string {
    const tradeId = this.generateTradeId();
    const { action, symbol, amount, price } = params;
    const totalValue = amount * (price || 0);

    this.pendingTrades.set(tradeId, {
      id: tradeId,
      params,
      timestamp: Date.now(),
    });

    return `⚠️ **TRADE CONFIRMATION REQUIRED**

**Action:** ${action.toUpperCase()}
**Symbol:** ${symbol}
**Amount:** ${amount}
**Price:** $${price?.toFixed(4) || "MARKET"}
**Total Value:** $${totalValue.toFixed(2)}

**Reply with:**
- "YES" to execute this trade
- "NO" to cancel

Trade ID: ${tradeId}`;
  }

  /**
   * Handle user confirmation response
   */
  handleConfirmation(
    response: string,
    executeCallback: (params: TradeParams) => Promise<TradeResult>
  ): Promise<string> {
    const normalizedResponse = response.trim().toLowerCase();
    
    if (normalizedResponse === "yes" || normalizedResponse === "y") {
      return this.executeLatestPendingTrade(executeCallback);
    }
    
    if (normalizedResponse === "no" || normalizedResponse === "n") {
      this.clearPendingTrades();
      return Promise.resolve("❌ Trade cancelled by user");
    }

    return Promise.resolve("Please respond with YES or NO to confirm/cancel the trade");
  }

  /**
   * Execute the most recent pending trade
   */
  private async executeLatestPendingTrade(
    executeCallback: (params: TradeParams) => Promise<TradeResult>
  ): Promise<string> {
    const pendingTrades = Array.from(this.pendingTrades.values());
    if (pendingTrades.length === 0) {
      return "No pending trades to execute";
    }

    const latestTrade = pendingTrades[pendingTrades.length - 1];
    this.pendingTrades.delete(latestTrade.id);

    try {
      const result = await executeCallback(latestTrade.params);
      return `✅ **TRADE CONFIRMED & EXECUTED**\n\n${this.formatTradeResult(result)}`;
    } catch (error) {
      return `❌ Trade execution failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  private clearPendingTrades(): void {
    this.pendingTrades.clear();
  }

  private generateTradeId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private formatTradeResult(result: TradeResult): string {
    return `**Trade Result:**
- Status: ${result.success ? "✅ SUCCESS" : "❌ FAILED"}
- Transaction: ${result.txHash || "N/A"}
- Message: ${result.message}`;
  }

  /**
   * Get status of current mode and pending trades
   */
  getStatus(): string {
    const config = this.getConfig();
    const pendingCount = this.pendingTrades.size;

    return `**Trading Mode Status:**
- Current Mode: ${this.currentMode.toUpperCase()}
- Auto-trade: ${config.autoTradeEnabled ? "ON" : "OFF"}
- Confirmation Required: ${config.requireConfirmation ? "YES" : "NO"}
- Simulation Only: ${config.simulateOnly ? "YES" : "NO"}
- Pending Trades: ${pendingCount}`;
  }
}

export interface TradeParams {
  action: "buy" | "sell";
  symbol: string;
  amount: number;
  price?: number;
  slippage?: number;
}

export interface TradeResult {
  success: boolean;
  txHash?: string;
  message: string;
  actualPrice?: number;
  actualAmount?: number;
}

interface PendingTrade {
  id: string;
  params: TradeParams;
  timestamp: number;
}
