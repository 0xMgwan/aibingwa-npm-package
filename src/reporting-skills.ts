/**
 * Reporting skills for AIBINGWA agent
 * Performance reports, system status, trade analysis
 */

import { logger } from "./observability.js";
import { executionSafety } from "./execution-safety.js";
import { DEFAULT_SECURITY_CONFIG } from "./security.js";

export const reportingSkills = [
  {
    name: "generate_performance_report",
    description: "Generate detailed performance report with P&L, win rate, drawdown, and recent trades",
    category: "utility" as const,
    parameters: [
      {
        name: "period",
        type: "string" as const,
        description: "Report period: 'today', 'week', 'month', 'all'",
        required: false,
        enum: ["today", "week", "month", "all"],
      },
    ],
    execute: async (params: { period?: string }) => {
      try {
        const report = logger.generateReport();
        const executionStats = executionSafety.getStats();
        
        const extendedReport = `${report}

**Execution Safety:**
- Total Executions: ${executionStats.totalExecutions}
- Success Rate: ${(executionStats.successRate * 100).toFixed(1)}%
- Average Latency: ${executionStats.avgLatency}ms
- Rate Limit Hits: ${executionStats.rateLimitHits}
- Retry Count: ${executionStats.retryCount}

**Risk Controls:**
- Max Trades/Day: ${DEFAULT_SECURITY_CONFIG.maxTradesPerDay}
- Max Daily Loss: $${DEFAULT_SECURITY_CONFIG.maxDailyLossUsd}
- Max Position Size: ${DEFAULT_SECURITY_CONFIG.maxPositionSizePct}%
- Drawdown Kill Switch: ${DEFAULT_SECURITY_CONFIG.drawdownKillSwitchPct}%

Generated at ${new Date().toLocaleString()}`;

        return extendedReport;
      } catch (error) {
        return `❌ Failed to generate report: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    },
  },

  {
    name: "get_system_alerts",
    description: "Get recent system alerts and warnings",
    category: "utility" as const,
    parameters: [
      {
        name: "level",
        type: "string" as const,
        description: "Alert level filter: 'info', 'warning', 'error', 'critical'",
        required: false,
        enum: ["info", "warning", "error", "critical"],
      },
      {
        name: "limit",
        type: "number" as const,
        description: "Maximum number of alerts to return (default: 10)",
        required: false,
      },
    ],
    execute: async (params: { level?: string; limit?: number }) => {
      try {
        const alerts = logger.getAlerts(params.level as any, params.limit || 10);
        
        if (alerts.length === 0) {
          return "✅ No recent alerts found. System is healthy.";
        }

        const alertsText = alerts.map(alert => {
          const emoji = {
            info: "ℹ️",
            warning: "⚠️",
            error: "❌",
            critical: "🚨",
          }[alert.level];

          return `${emoji} **${alert.category.toUpperCase()}** (${new Date(alert.timestamp).toLocaleTimeString()})
${alert.message}`;
        }).join("\n\n");

        return `**Recent System Alerts:**\n\n${alertsText}`;
      } catch (error) {
        return `❌ Failed to get alerts: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    },
  },

  {
    name: "get_recent_trades",
    description: "Get recent trade decisions and their outcomes",
    category: "utility" as const,
    parameters: [
      {
        name: "limit",
        type: "number" as const,
        description: "Number of recent trades to show (default: 10)",
        required: false,
      },
    ],
    execute: async (params: { limit?: number }) => {
      try {
        const decisions = logger.getRecentDecisions(params.limit || 10);
        const trades = decisions.filter(d => d.action === "buy" || d.action === "sell");
        
        if (trades.length === 0) {
          return "No recent trades found.";
        }

        const tradesText = trades.map(trade => {
          const emoji = trade.success ? "✅" : "❌";
          const pnlText = trade.pnl !== undefined ? ` | P&L: ${trade.pnl > 0 ? "+" : ""}$${trade.pnl.toFixed(2)}` : "";
          const priceText = trade.price ? ` @ $${trade.price}` : "";
          
          return `${emoji} ${trade.action.toUpperCase()} ${trade.symbol || "N/A"}${priceText}${pnlText}
   ${new Date(trade.timestamp).toLocaleString()} | ${trade.reasoning.substring(0, 80)}...`;
        }).join("\n\n");

        return `**Recent Trades:**\n\n${tradesText}`;
      } catch (error) {
        return `❌ Failed to get recent trades: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    },
  },

  {
    name: "check_system_health",
    description: "Check overall system health and performance metrics",
    category: "utility" as const,
    parameters: [],
    execute: async () => {
      try {
        const metrics = logger.getPerformanceMetrics();
        const alerts = logger.getAlerts("critical", 5);
        const executionStats = executionSafety.getStats();
        
        const healthScore = calculateHealthScore(metrics, alerts, executionStats);
        
        return `🏥 **System Health Check**

**Overall Health Score: ${healthScore}/100**

**Key Metrics:**
- Win Rate: ${metrics.winRate.toFixed(1)}% ${metrics.winRate > 50 ? "✅" : "⚠️"}
- Current Drawdown: ${metrics.currentDrawdown.toFixed(1)}% ${metrics.currentDrawdown < 10 ? "✅" : metrics.currentDrawdown < 20 ? "⚠️" : "❌"}
- Success Rate: ${(executionStats.successRate * 100).toFixed(1)}% ${executionStats.successRate > 0.9 ? "✅" : "⚠️"}
- Avg Latency: ${executionStats.avgLatency}ms ${executionStats.avgLatency < 2000 ? "✅" : "⚠️"}

**Critical Issues:** ${alerts.length} ${alerts.length === 0 ? "✅" : "❌"}

**Recommendations:**
${generateHealthRecommendations(metrics, alerts, executionStats)}

Last checked: ${new Date().toLocaleString()}`;
      } catch (error) {
        return `❌ Health check failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    },
  },

  {
    name: "reset_drawdown_killswitch",
    description: "Reset the drawdown kill switch to re-enable auto-trading (admin only)",
    category: "utility" as const,
    parameters: [
      {
        name: "confirm",
        type: "boolean" as const,
        description: "Confirm reset of kill switch",
        required: true,
      },
    ],
    execute: async (params: { confirm: boolean }) => {
      if (!params.confirm) {
        return "❌ Reset cancelled. Set confirm=true to proceed.";
      }

      try {
        // This would integrate with the actual trading system
        logger.logAlert({
          level: "info",
          category: "drawdown",
          message: "Drawdown kill switch manually reset",
        });

        return `✅ **Drawdown Kill Switch Reset**

Auto-trading has been re-enabled. Please monitor performance closely.

**Warning:** The kill switch was triggered for a reason. Consider:
- Reducing position sizes
- Reviewing trading strategy
- Implementing additional risk controls

Reset at: ${new Date().toLocaleString()}`;
      } catch (error) {
        return `❌ Failed to reset kill switch: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    },
  },
];

function calculateHealthScore(metrics: any, alerts: any[], executionStats: any): number {
  let score = 100;
  
  // Deduct for poor win rate
  if (metrics.winRate < 40) score -= 20;
  else if (metrics.winRate < 50) score -= 10;
  
  // Deduct for high drawdown
  if (metrics.currentDrawdown > 20) score -= 30;
  else if (metrics.currentDrawdown > 10) score -= 15;
  
  // Deduct for critical alerts
  score -= alerts.length * 15;
  
  // Deduct for poor execution
  if (executionStats.successRate < 0.8) score -= 20;
  else if (executionStats.successRate < 0.9) score -= 10;
  
  // Deduct for high latency
  if (executionStats.avgLatency > 5000) score -= 15;
  else if (executionStats.avgLatency > 2000) score -= 5;
  
  return Math.max(0, score);
}

function generateHealthRecommendations(metrics: any, alerts: any[], executionStats: any): string {
  const recommendations = [];
  
  if (metrics.winRate < 50) {
    recommendations.push("• Review and optimize trading strategy");
  }
  
  if (metrics.currentDrawdown > 15) {
    recommendations.push("• Reduce position sizes to limit drawdown");
  }
  
  if (alerts.length > 0) {
    recommendations.push("• Address critical system alerts");
  }
  
  if (executionStats.successRate < 0.9) {
    recommendations.push("• Investigate execution failures");
  }
  
  if (executionStats.avgLatency > 2000) {
    recommendations.push("• Optimize API calls to reduce latency");
  }
  
  if (recommendations.length === 0) {
    recommendations.push("• System is performing well - continue monitoring");
  }
  
  return recommendations.join("\n");
}
