/**
 * Observability system for AIBINGWA agent
 * Structured logging, performance tracking, and reporting
 */

export interface TradeDecision {
  id: string;
  timestamp: number;
  userId: string;
  action: "scan" | "research" | "buy" | "sell" | "hold";
  symbol?: string;
  amount?: number;
  price?: number;
  reasoning: string;
  confidence: number;
  latency: number;
  success: boolean;
  error?: string;
  pnl?: number;
}

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  currentDrawdown: number;
  profitFactor: number;
  sharpeRatio: number;
  lastTrades: TradeDecision[];
}

export interface SystemAlert {
  id: string;
  timestamp: number;
  level: "info" | "warning" | "error" | "critical";
  category: "api_latency" | "missed_scan" | "execution_error" | "rate_limit" | "drawdown";
  message: string;
  metadata?: Record<string, any>;
}

export class ObservabilityLogger {
  private tradeDecisions: TradeDecision[] = [];
  private systemAlerts: SystemAlert[] = [];
  private performanceCache: PerformanceMetrics | null = null;
  private lastCacheUpdate = 0;
  private readonly CACHE_TTL = 60000; // 1 minute

  /**
   * Log a trade decision with structured data
   */
  logTradeDecision(decision: Omit<TradeDecision, "id" | "timestamp">): string {
    const id = this.generateDecisionId();
    const fullDecision: TradeDecision = {
      id,
      timestamp: Date.now(),
      ...decision,
    };

    this.tradeDecisions.push(fullDecision);
    
    // Keep only last 1000 decisions
    if (this.tradeDecisions.length > 1000) {
      this.tradeDecisions = this.tradeDecisions.slice(-1000);
    }

    // Log as structured JSON
    console.log(JSON.stringify({
      type: "trade_decision",
      ...fullDecision,
    }));

    // Clear performance cache
    this.performanceCache = null;

    return id;
  }

  /**
   * Log system alert
   */
  logAlert(alert: Omit<SystemAlert, "id" | "timestamp">): void {
    const fullAlert: SystemAlert = {
      id: this.generateAlertId(),
      timestamp: Date.now(),
      ...alert,
    };

    this.systemAlerts.push(fullAlert);
    
    // Keep only last 500 alerts
    if (this.systemAlerts.length > 500) {
      this.systemAlerts = this.systemAlerts.slice(-500);
    }

    // Log as structured JSON
    console.log(JSON.stringify({
      type: "system_alert",
      ...fullAlert,
    }));

    // Send critical alerts immediately
    if (alert.level === "critical") {
      this.handleCriticalAlert(fullAlert);
    }
  }

  /**
   * Get performance metrics with caching
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const now = Date.now();
    
    if (this.performanceCache && (now - this.lastCacheUpdate) < this.CACHE_TTL) {
      return this.performanceCache;
    }

    this.performanceCache = this.calculatePerformanceMetrics();
    this.lastCacheUpdate = now;
    
    return this.performanceCache;
  }

  /**
   * Generate detailed performance report
   */
  generateReport(): string {
    const metrics = this.getPerformanceMetrics();
    const recentAlerts = this.systemAlerts.slice(-10);
    
    return `📊 **AIBINGWA Performance Report**

**Trading Performance:**
- Total Trades: ${metrics.totalTrades}
- Win Rate: ${metrics.winRate.toFixed(1)}%
- Total P&L: ${metrics.totalPnl > 0 ? "+" : ""}$${metrics.totalPnl.toFixed(2)}
- Average Win: $${metrics.avgWin.toFixed(2)}
- Average Loss: $${metrics.avgLoss.toFixed(2)}
- Profit Factor: ${metrics.profitFactor.toFixed(2)}

**Risk Metrics:**
- Max Drawdown: ${metrics.maxDrawdown.toFixed(1)}%
- Current Drawdown: ${metrics.currentDrawdown.toFixed(1)}%
- Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}

**Recent Performance:**
${metrics.lastTrades.slice(-5).map(trade => 
  `${trade.success ? "✅" : "❌"} ${trade.action.toUpperCase()} ${trade.symbol || "N/A"} - ${trade.pnl ? (trade.pnl > 0 ? "+" : "") + trade.pnl.toFixed(2) : "N/A"}`
).join("\n")}

**System Health:**
- Recent Alerts: ${recentAlerts.length}
- Critical Issues: ${recentAlerts.filter(a => a.level === "critical").length}
- API Latency Issues: ${recentAlerts.filter(a => a.category === "api_latency").length}

**Status:**
${this.getSystemStatus(metrics)}`;
  }

  /**
   * Check for API latency spikes
   */
  checkApiLatency(latency: number, endpoint: string): void {
    if (latency > 5000) { // 5 seconds
      this.logAlert({
        level: "warning",
        category: "api_latency",
        message: `High API latency detected: ${latency}ms for ${endpoint}`,
        metadata: { latency, endpoint },
      });
    }

    if (latency > 15000) { // 15 seconds
      this.logAlert({
        level: "error",
        category: "api_latency",
        message: `Critical API latency: ${latency}ms for ${endpoint}`,
        metadata: { latency, endpoint },
      });
    }
  }

  /**
   * Check for missed scans
   */
  checkMissedScan(expectedTime: number, actualTime: number): void {
    const delay = actualTime - expectedTime;
    
    if (delay > 60000) { // 1 minute late
      this.logAlert({
        level: "warning",
        category: "missed_scan",
        message: `Market scan delayed by ${Math.round(delay / 1000)}s`,
        metadata: { expectedTime, actualTime, delay },
      });
    }
  }

  /**
   * Get recent trade decisions
   */
  getRecentDecisions(limit: number = 20): TradeDecision[] {
    return this.tradeDecisions.slice(-limit);
  }

  /**
   * Get system alerts by level
   */
  getAlerts(level?: SystemAlert["level"], limit: number = 50): SystemAlert[] {
    let alerts = this.systemAlerts.slice(-limit);
    
    if (level) {
      alerts = alerts.filter(alert => alert.level === level);
    }
    
    return alerts.reverse(); // Most recent first
  }

  private calculatePerformanceMetrics(): PerformanceMetrics {
    const trades = this.tradeDecisions.filter(d => d.action === "buy" || d.action === "sell");
    
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnl: 0,
        avgWin: 0,
        avgLoss: 0,
        maxDrawdown: 0,
        currentDrawdown: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        lastTrades: [],
      };
    }

    const completedTrades = trades.filter(t => t.pnl !== undefined);
    const winningTrades = completedTrades.filter(t => t.pnl! > 0);
    const losingTrades = completedTrades.filter(t => t.pnl! < 0);
    
    const totalPnl = completedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl!, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl!, 0) / losingTrades.length) : 0;
    
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl!, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl!, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    
    const { maxDrawdown, currentDrawdown } = this.calculateDrawdown(completedTrades);
    const sharpeRatio = this.calculateSharpeRatio(completedTrades);

    return {
      totalTrades: completedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0,
      totalPnl,
      avgWin,
      avgLoss,
      maxDrawdown,
      currentDrawdown,
      profitFactor,
      sharpeRatio,
      lastTrades: trades.slice(-20),
    };
  }

  private calculateDrawdown(trades: TradeDecision[]): { maxDrawdown: number; currentDrawdown: number } {
    let peak = 0;
    let maxDrawdown = 0;
    let currentBalance = 0;
    
    for (const trade of trades) {
      currentBalance += trade.pnl || 0;
      
      if (currentBalance > peak) {
        peak = currentBalance;
      }
      
      const drawdown = peak > 0 ? ((peak - currentBalance) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    const currentDrawdown = peak > 0 ? ((peak - currentBalance) / peak) * 100 : 0;
    
    return { maxDrawdown, currentDrawdown };
  }

  private calculateSharpeRatio(trades: TradeDecision[]): number {
    if (trades.length < 2) return 0;
    
    const returns = trades.map(t => t.pnl || 0);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev > 0 ? avgReturn / stdDev : 0;
  }

  private getSystemStatus(metrics: PerformanceMetrics): string {
    const criticalAlerts = this.systemAlerts.filter(a => a.level === "critical" && Date.now() - a.timestamp < 3600000).length;
    
    if (criticalAlerts > 0) {
      return "🔴 CRITICAL - System issues detected";
    }
    
    if (metrics.currentDrawdown > 15) {
      return "🟡 WARNING - High drawdown";
    }
    
    if (metrics.winRate < 40 && metrics.totalTrades > 10) {
      return "🟡 WARNING - Low win rate";
    }
    
    return "🟢 HEALTHY - System operating normally";
  }

  private handleCriticalAlert(alert: SystemAlert): void {
    // In a real implementation, this would send notifications
    console.error(`🚨 CRITICAL ALERT: ${alert.message}`);
    
    // Auto-disable trading on critical drawdown
    if (alert.category === "drawdown") {
      console.log("🛑 Auto-disabling trading due to critical drawdown");
      // This would integrate with the trading system to disable auto-trade
    }
  }

  private generateDecisionId(): string {
    return `td_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private generateAlertId(): string {
    return `al_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}

// Global logger instance
export const logger = new ObservabilityLogger();
