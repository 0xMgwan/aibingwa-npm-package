/**
 * Security utilities for AIBINGWA agent
 * Prevents credential leaks and enforces safe practices
 */

export interface SecurityConfig {
  maxTradesPerDay: number;
  maxDailyLossUsd: number;
  maxOpenPositions: number;
  cooldownMinutesAfterLossStreak: number;
  maxPositionSizePct: number;
  drawdownKillSwitchPct: number;
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  maxTradesPerDay: 100, // Much higher limit
  maxDailyLossUsd: 1000, // Higher daily loss limit
  maxOpenPositions: 10, // More positions allowed
  cooldownMinutesAfterLossStreak: 5, // Shorter cooldown
  maxPositionSizePct: 10, // 10% max position size - more flexible
  drawdownKillSwitchPct: 50, // 50% drawdown before kill switch
};

/**
 * Detects potential credential leaks in user messages
 */
export function detectCredentialLeak(message: string): boolean {
  const sensitivePatterns = [
    /sk-[a-zA-Z0-9]{32,}/i, // OpenAI/Anthropic API keys
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}:[^\s]+/i, // email:password
    /password[:\s]+[^\s]+/i, // password: xxx
    /private[_\s]?key[:\s]+[^\s]+/i, // private key
    /seed[_\s]?phrase[:\s]+/i, // seed phrase
    /mnemonic[:\s]+/i, // mnemonic
    /0x[a-fA-F0-9]{64}/i, // Ethereum private key
    /[1-9A-HJ-NP-Za-km-z]{51,52}/i, // Bitcoin private key (WIF)
  ];

  return sensitivePatterns.some(pattern => pattern.test(message));
}

/**
 * Generates security warning message
 */
export function getSecurityWarning(): string {
  return `🚨 **SECURITY WARNING** 🚨

Never share passwords, private keys, API keys, or seed phrases in chat messages!

**Secure alternatives:**
- Set environment variables: \`GMAIL_USER\`, \`GMAIL_PASS\`, \`TWITTER_API_KEY\`
- Use secure configuration files
- Store credentials in your system's keychain

**What NOT to share:**
- Passwords
- Private keys (0x...)
- API keys (sk-...)
- Seed phrases
- Email:password combinations

Your security is my priority. Please use secure credential storage methods.`;
}

/**
 * Daily trading limits tracker
 */
export class TradingLimits {
  private dailyTrades: number = 0;
  private dailyLoss: number = 0;
  private lastResetDate: string = new Date().toDateString();
  private consecutiveLosses: number = 0;
  private lastLossTime: number = 0;
  private totalDrawdown: number = 0;
  private autoTradeKilled: boolean = false;

  constructor(private config: SecurityConfig = DEFAULT_SECURITY_CONFIG) {}

  /**
   * Reset daily counters if new day
   */
  private resetIfNewDay(): void {
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.dailyTrades = 0;
      this.dailyLoss = 0;
      this.lastResetDate = today;
    }
  }

  /**
   * Check if trade is allowed based on risk limits
   */
  canTrade(positionSizeUsd: number, currentPortfolioValue: number): {
    allowed: boolean;
    reason?: string;
  } {
    this.resetIfNewDay();

    // Check if auto-trade was killed due to drawdown
    if (this.autoTradeKilled) {
      return {
        allowed: false,
        reason: "Auto-trade disabled due to excessive drawdown. Manual reset required.",
      };
    }

    // Check daily trade limit
    if (this.dailyTrades >= this.config.maxTradesPerDay) {
      return {
        allowed: false,
        reason: `Daily trade limit reached (${this.config.maxTradesPerDay})`,
      };
    }

    // Check position size limit
    const positionSizePct = (positionSizeUsd / currentPortfolioValue) * 100;
    if (positionSizePct > this.config.maxPositionSizePct) {
      return {
        allowed: false,
        reason: `Position size ${positionSizePct.toFixed(1)}% exceeds limit of ${this.config.maxPositionSizePct}%`,
      };
    }

    // Check cooldown after loss streak
    const now = Date.now();
    if (
      this.consecutiveLosses >= 3 &&
      now - this.lastLossTime < this.config.cooldownMinutesAfterLossStreak * 60 * 1000
    ) {
      const remainingMinutes = Math.ceil(
        (this.config.cooldownMinutesAfterLossStreak * 60 * 1000 - (now - this.lastLossTime)) / 60000
      );
      return {
        allowed: false,
        reason: `Cooldown active after loss streak. ${remainingMinutes} minutes remaining.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record a completed trade
   */
  recordTrade(pnlUsd: number, portfolioValue: number): void {
    this.resetIfNewDay();
    this.dailyTrades++;

    if (pnlUsd < 0) {
      this.dailyLoss += Math.abs(pnlUsd);
      this.consecutiveLosses++;
      this.lastLossTime = Date.now();
      this.totalDrawdown += Math.abs(pnlUsd);

      // Check drawdown kill switch
      const drawdownPct = (this.totalDrawdown / portfolioValue) * 100;
      if (drawdownPct >= this.config.drawdownKillSwitchPct) {
        this.autoTradeKilled = true;
      }
    } else {
      this.consecutiveLosses = 0;
      // Reduce drawdown on wins
      this.totalDrawdown = Math.max(0, this.totalDrawdown - pnlUsd * 0.5);
    }
  }

  /**
   * Check if daily loss limit exceeded
   */
  isDailyLossExceeded(): boolean {
    this.resetIfNewDay();
    return this.dailyLoss >= this.config.maxDailyLossUsd;
  }

  /**
   * Get current trading status
   */
  getStatus(): {
    dailyTrades: number;
    dailyLoss: number;
    consecutiveLosses: number;
    autoTradeKilled: boolean;
    drawdownPct: number;
  } {
    this.resetIfNewDay();
    return {
      dailyTrades: this.dailyTrades,
      dailyLoss: this.dailyLoss,
      consecutiveLosses: this.consecutiveLosses,
      autoTradeKilled: this.autoTradeKilled,
      drawdownPct: this.totalDrawdown,
    };
  }

  /**
   * Manually reset auto-trade kill switch (admin only)
   */
  resetKillSwitch(): void {
    this.autoTradeKilled = false;
    this.totalDrawdown = 0;
    this.consecutiveLosses = 0;
  }
}
