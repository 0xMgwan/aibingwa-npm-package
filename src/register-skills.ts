import { SkillRegistry } from "./skills.js";
import { getPerformanceSummary, getOpenPositions, getTradeHistory, loadMemory } from "./memory.js";
import { BankrX402Client } from "./bankr-x402.js";
import { TwitterClient } from "./twitter.js";

// ============================================================
// REGISTER ALL SKILLS — Called once at startup
// ============================================================

export type BankrPromptFn = (prompt: string, threadId?: string) => Promise<{
  success: boolean;
  jobId: string;
  threadId?: string;
  status: string;
  response?: string;
  error?: string;
  transactions?: any[];
}>;

export type ExecuteActionFn = (actionName: string, args?: Record<string, any>) => Promise<string>;
export type GetWalletAddressFn = () => Promise<string>;
export type GetEthBalanceFn = (addr: string) => Promise<string>;
export type GetTokenBalanceFn = (tokenAddr: string, walletAddr: string, decimals: number) => Promise<string>;
export type ResolveAddressFn = (input: string) => Promise<{ address: string; display: string }>;
export type GetPriceFn = (symbol: string) => Promise<string>;

export interface SkillDeps {
  bankrPrompt: BankrPromptFn;
  executeAction?: ExecuteActionFn;
  getWalletAddress?: GetWalletAddressFn;
  getEthBalance?: GetEthBalanceFn;
  getTokenBalance?: GetTokenBalanceFn;
  resolveAddress?: ResolveAddressFn;
  getPrice?: GetPriceFn;
  tokenRegistry?: Record<string, { symbol: string; name: string; address: string; decimals: number; pythFeedId?: string }>;
  isBankrConfigured: () => boolean;
  trader?: { scanMarket: () => Promise<string>; toggleAutoTrade: (on: boolean) => string; updateSettings: (u: any) => string; getMemory: () => any };
  agentInstance?: { setPolymarketStrategy: (strategy: string, scanIntervalMin?: number) => string };
  x402Client?: BankrX402Client;
  twitterClient?: TwitterClient;
}

export function registerAllSkills(registry: SkillRegistry, deps: SkillDeps): void {
  const {
    bankrPrompt, executeAction, getWalletAddress,
    getEthBalance, getTokenBalance, resolveAddress, getPrice,
    tokenRegistry, isBankrConfigured, trader,
  } = deps;

  // ── WALLET SKILLS ────────────────────────────────────────
  if (getWalletAddress) {
    registry.register({
      name: "get_wallet_address",
      description: "Get the user's wallet address on Base",
      category: "wallet",
      parameters: [],
      execute: async () => {
        const addr = await getWalletAddress();
        return addr || "Could not retrieve wallet address";
      },
    });
  }

  if (getWalletAddress && getEthBalance) {
    registry.register({
      name: "get_eth_balance",
      description: "Get the ETH balance of the wallet",
      category: "wallet",
      parameters: [],
      execute: async () => {
        const addr = await getWalletAddress();
        if (!addr) return "Wallet not initialized";
        const bal = await getEthBalance(addr);
        return `ETH Balance: ${parseFloat(bal).toFixed(6)} ETH`;
      },
    });
  }

  if (getWalletAddress && getTokenBalance && tokenRegistry) {
    registry.register({
      name: "get_token_balance",
      description: "Get the balance of a specific token (USDC, WETH, DAI, PEPE, DEGEN, etc.)",
      category: "wallet",
      parameters: [
        { name: "token", type: "string", description: "Token symbol (e.g., usdc, weth, dai, pepe)", required: true },
      ],
      execute: async (params: any) => {
        const key = params.token.toLowerCase();
        const entry = tokenRegistry[key] || Object.values(tokenRegistry).find((t: any) => t.symbol.toLowerCase() === key);
        if (!entry) return `Unknown token: ${params.token}. Known tokens: ${Object.values(tokenRegistry).map((t: any) => t.symbol).join(", ")}`;
        if (!entry.address) return `${entry.symbol} is not an on-chain token on Base`;
        const addr = await getWalletAddress();
        if (!addr) return "Wallet not initialized";
        const bal = await getTokenBalance(entry.address, addr, entry.decimals);
        return `${entry.symbol} Balance: ${parseFloat(bal).toFixed(6)} ${entry.symbol}`;
      },
    });

    registry.register({
      name: "get_all_balances",
      description: "Get balances of all tokens in the wallet (ETH, USDC, WETH, DAI, etc.)",
      category: "wallet",
      parameters: [],
      execute: async () => {
        const addr = await getWalletAddress();
        if (!addr) return "Wallet not initialized";
        const ethBal = getEthBalance ? await getEthBalance(addr) : "N/A";
        let result = `Wallet: ${addr}\n\nETH: ${parseFloat(ethBal).toFixed(6)}`;
        for (const entry of Object.values(tokenRegistry)) {
          if (entry.address && entry.address !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
            const bal = await getTokenBalance(entry.address, addr, entry.decimals);
            if (parseFloat(bal) > 0) {
              result += `\n${entry.symbol}: ${parseFloat(bal).toFixed(6)}`;
            }
          }
        }
        return result;
      },
    });
  }

  registry.register({
    name: "get_bankr_balance",
    description: "Check the Bankr managed wallet balance across ALL chains (Base, Polygon, Solana, Ethereum, etc.). Use this for any balance query.",
    category: "wallet",
    parameters: [
      { name: "chain", type: "string", description: "Specific chain to check (e.g., 'polygon', 'base', 'solana', 'ethereum'). Leave empty for all chains.", required: false },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const chainFilter = params.chain ? ` on ${params.chain}` : " across all chains (Base, Polygon, Solana, Ethereum, Arbitrum, Optimism)";
      const result = await bankrPrompt(`Show me my complete wallet balance${chainFilter}. Include all tokens, their amounts, and USD values. Show every chain.`);
      return result.success ? result.response || "No data" : `Error: ${result.error}`;
    },
  });

  // ── TRADING SKILLS ───────────────────────────────────────
  if (executeAction && tokenRegistry) {
    registry.register({
      name: "swap_tokens",
      description: "Swap/trade one token for another on Base via AgentKit (e.g., swap 5 USDC for ETH)",
      category: "trading",
      parameters: [
        { name: "amount", type: "string", description: "Amount to swap", required: true },
        { name: "from_token", type: "string", description: "Token to sell (e.g., usdc, eth)", required: true },
        { name: "to_token", type: "string", description: "Token to buy (e.g., eth, usdc)", required: true },
      ],
      execute: async (params: any) => {
        const from = tokenRegistry[params.from_token.toLowerCase()];
        const to = tokenRegistry[params.to_token.toLowerCase()];
        if (!from) return `Unknown from token: ${params.from_token}`;
        if (!to) return `Unknown to token: ${params.to_token}`;
        const result = await executeAction("CdpApiActionProvider_trade", {
          fromAssetId: from.address || from.symbol.toLowerCase(),
          toAssetId: to.address || to.symbol.toLowerCase(),
          amount: params.amount,
        });
        return result;
      },
    });
  }

  if (executeAction && resolveAddress && tokenRegistry) {
    registry.register({
      name: "send_tokens",
      description: "Send tokens to an address or ENS name (e.g., send 10 USDC to vitalik.eth)",
      category: "trading",
      parameters: [
        { name: "amount", type: "string", description: "Amount to send", required: true },
        { name: "token", type: "string", description: "Token symbol (e.g., usdc, eth)", required: true },
        { name: "recipient", type: "string", description: "Recipient address or ENS name", required: true },
      ],
      execute: async (params: any) => {
        const token = tokenRegistry[params.token.toLowerCase()];
        if (!token) return `Unknown token: ${params.token}`;
        const { address: toAddr, display } = await resolveAddress(params.recipient);
        if (!toAddr) return `Could not resolve address: ${params.recipient}`;
        const isEth = token.symbol === "ETH";
        const actionName = isEth ? "CdpSmartWalletActionProvider_send_eth" : "CdpSmartWalletActionProvider_send_token";
        const args: any = isEth
          ? { to: toAddr, value: params.amount }
          : { to: toAddr, value: params.amount, contractAddress: token.address };
        const result = await executeAction(actionName, args);
        return `Sent ${params.amount} ${token.symbol} to ${display}\n\n${result}`;
      },
    });
  }

  registry.register({
    name: "snipe_token",
    description: "Buy a token on Base via Bankr AI (for any token, especially memecoins and low-cap tokens)",
    category: "trading",
    parameters: [
      { name: "amount", type: "string", description: "Dollar amount to spend (e.g., 5)", required: true },
      { name: "token", type: "string", description: "Token symbol to buy (e.g., PEPE, DEGEN)", required: true },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt(`Buy $${params.amount} of ${params.token} on Base`);
      return result.success ? `Bought $${params.amount} of ${params.token}\n\n${result.response}` : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "sell_token",
    description: "Sell a token on Base via Bankr AI",
    category: "trading",
    parameters: [
      { name: "token", type: "string", description: "Token symbol to sell", required: true },
      { name: "percentage", type: "string", description: "Percentage to sell (e.g., 50 for half, 100 for all)", required: false },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const pct = params.percentage || "100";
      const result = await bankrPrompt(`Sell ${pct}% of my ${params.token} on Base`);
      return result.success ? result.response || "Done" : `Failed: ${result.error}`;
    },
  });

  if (executeAction) {
    registry.register({
      name: "wrap_eth",
      description: "Wrap ETH into WETH",
      category: "trading",
      parameters: [
        { name: "amount", type: "string", description: "Amount of ETH to wrap", required: true },
      ],
      execute: async (params: any) => executeAction("WethActionProvider_wrap_eth", { amountToWrap: params.amount }),
    });

    registry.register({
      name: "unwrap_eth",
      description: "Unwrap WETH back to ETH",
      category: "trading",
      parameters: [
        { name: "amount", type: "string", description: "Amount of WETH to unwrap", required: true },
      ],
      execute: async (params: any) => executeAction("WethActionProvider_unwrap_eth", { amountToUnwrap: params.amount }),
    });
  }

  // ── RESEARCH SKILLS ──────────────────────────────────────
  if (getPrice) {
    registry.register({
      name: "get_token_price",
      description: "Get the current price of a token (ETH, BTC, SOL, USDC, DAI via Pyth oracle)",
      category: "research",
      parameters: [
        { name: "token", type: "string", description: "Token symbol", required: true },
      ],
      execute: async (params: any) => getPrice(params.token),
    });
  }

  registry.register({
    name: "research_token",
    description: "Get detailed research and analysis on any token — price, market cap, volume, sentiment, risk assessment",
    category: "research",
    parameters: [
      { name: "token", type: "string", description: "Token name or symbol to research", required: true },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt(
        `Give me a comprehensive analysis of ${params.token}: current price, market cap, 24h volume, 24h change, holder info, liquidity, and risk assessment. Be concise.`
      );
      return result.success ? result.response || "No data" : `Research failed: ${result.error}`;
    },
  });

  registry.register({
    name: "get_trending_tokens",
    description: "Find trending tokens on Base blockchain right now",
    category: "research",
    parameters: [],
    execute: async () => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt("What tokens are trending on Base right now? Show me the top 10 with their prices and 24h changes.");
      return result.success ? result.response || "No data" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "find_lowcap_gems",
    description: "Find low market cap tokens (under $40k) on Base — potential gems",
    category: "research",
    parameters: [
      { name: "max_mcap", type: "number", description: "Maximum market cap in dollars (default 40000)", required: false },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const maxCap = params.max_mcap || 40000;
      const result = await bankrPrompt(
        `Find me trending or new tokens on Base with a market cap under $${maxCap}. Show token name, symbol, price, market cap, 24h volume, and 24h change. Focus on tokens with good volume and momentum. List up to 10 tokens.`
      );
      return result.success ? result.response || "No data" : `Failed: ${result.error}`;
    },
  });

  // ── AUTONOMOUS TRADING SKILLS ────────────────────────────
  if (trader) {
    registry.register({
      name: "scan_market",
      description: "Run a full market scan to find and score low-cap trading opportunities on Base",
      category: "trading",
      parameters: [],
      execute: async () => trader.scanMarket(),
    });

    registry.register({
      name: "toggle_autotrade",
      description: "Enable or disable autonomous auto-trading",
      category: "trading",
      parameters: [
        { name: "enabled", type: "boolean", description: "true to enable, false to disable", required: true },
      ],
      execute: async (params: any) => trader.toggleAutoTrade(params.enabled),
    });

    registry.register({
      name: "update_trading_settings",
      description: "Update trading parameters like max market cap, buy amount, take profit %, stop loss %, scan interval",
      category: "trading",
      parameters: [
        { name: "max_market_cap", type: "number", description: "Max market cap filter in dollars", required: false },
        { name: "buy_amount", type: "string", description: "Dollar amount per trade", required: false },
        { name: "take_profit_pct", type: "number", description: "Take profit percentage (e.g., 100 for 2x)", required: false },
        { name: "stop_loss_pct", type: "number", description: "Stop loss percentage (e.g., 30)", required: false },
        { name: "scan_interval_min", type: "number", description: "Minutes between auto-scans", required: false },
        { name: "max_open_positions", type: "number", description: "Maximum concurrent open positions", required: false },
      ],
      execute: async (params: any) => {
        const updates: any = {};
        if (params.max_market_cap) updates.maxMarketCap = params.max_market_cap;
        if (params.buy_amount) updates.maxBuyAmount = params.buy_amount;
        if (params.take_profit_pct) updates.takeProfitPct = params.take_profit_pct;
        if (params.stop_loss_pct) updates.stopLossPct = params.stop_loss_pct;
        if (params.scan_interval_min) updates.scanIntervalMin = params.scan_interval_min;
        if (params.max_open_positions) updates.maxOpenPositions = params.max_open_positions;
        return trader.updateSettings(updates);
      },
    });
  }

  // ── PORTFOLIO SKILLS ─────────────────────────────────────
  registry.register({
    name: "get_trading_performance",
    description: "Show trading performance stats: win rate, P&L, total trades, settings",
    category: "utility",
    parameters: [],
    execute: async () => getPerformanceSummary(loadMemory()),
  });

  registry.register({
    name: "get_open_positions",
    description: "Show all currently open trading positions",
    category: "utility",
    parameters: [],
    execute: async () => {
      const mem = loadMemory();
      const open = getOpenPositions(mem);
      if (open.length === 0) return "No open positions";
      return open.map((t: any) => `${t.symbol}: ${t.amount} @ ${t.price} (${t.reason.slice(0, 50)})`).join("\n");
    },
  });

  registry.register({
    name: "get_trade_history",
    description: "Show recent trade history with P&L",
    category: "utility",
    parameters: [
      { name: "limit", type: "number", description: "Number of trades to show (default 10)", required: false },
    ],
    execute: async (params: any) => {
      const trades = getTradeHistory(loadMemory(), params.limit || 10);
      if (trades.length === 0) return "No trades yet";
      return trades.map((t: any) => {
        const pnl = t.pnl ? ` | P&L: ${t.pnl}%` : "";
        return `${t.symbol}: ${t.action} ${t.amount} — ${t.status}${pnl}`;
      }).join("\n");
    },
  });

  // ── PREDICTION MARKET SKILLS ─────────────────────────────
  // PRIMARY SKILL: Use this for ALL Polymarket actions — betting, trading, scanning, everything.
  // Bankr handles the full flow: find market → analyze → place bet.
  registry.register({
    name: "polymarket",
    description: "DO ANYTHING on Polymarket — bet, trade, scan markets, check odds, find opportunities. This is the PRIMARY Polymarket skill. Use it whenever the user mentions Polymarket, betting, prediction markets, or wants to place a bet. Pass the user's full request as the prompt. Examples: 'Bet $2 on BTC 15min up', 'Find best 15-minute markets and bet', 'What are the odds on SOL going up?'",
    category: "prediction",
    parameters: [
      { name: "prompt", type: "string", description: "The full Polymarket action to execute. Be specific: include market name, amount, outcome (Yes/No/Up/Down) if betting. Examples: 'Bet $5 on Yes for BTC 15-minute up/down market', 'Search for trending prediction markets', 'Show my positions'", required: true },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      try {
        const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) =>
          setTimeout(() => resolve({ success: false, error: "Bankr request timed out after 180s" }), 180000)
        );
        const result = await Promise.race([bankrPrompt(params.prompt), timeoutPromise]);
        return result.success ? result.response || "Done" : `Failed: ${result.error}`;
      } catch (err: any) {
        return `Polymarket error: ${err.message || "Unknown error"}`;
      }
    },
  });

  registry.register({
    name: "polymarket_positions",
    description: "View your current Polymarket positions, active bets, and P&L. Use ONLY when the user asks about their existing positions.",
    category: "prediction",
    parameters: [],
    execute: async () => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt("Show my Polymarket positions and P&L");
      return result.success ? result.response || "No positions" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "set_polymarket_strategy",
    description: "Activate continuous autonomous Polymarket trading. The agent will scan and execute trades on a CONTINUOUS LOOP based on the strategy. Use this when the user gives a long-running trading mandate like 'trade 15-min BTC markets for the next 24 hours' or 'keep scanning and trading Polymarket'.",
    category: "prediction",
    parameters: [
      { name: "strategy", type: "string", description: "The full trading strategy/mandate from the user", required: true },
      { name: "scan_interval_min", type: "string", description: "How often to scan in minutes (default 15). Use shorter for short-term markets.", required: false },
    ],
    execute: async (params: any) => {
      if (!deps.agentInstance) return "Agent instance not available for autonomous trading";
      const interval = params.scan_interval_min ? parseInt(params.scan_interval_min) : undefined;
      return deps.agentInstance.setPolymarketStrategy(params.strategy, interval);
    },
  });

  // ── LEVERAGE TRADING (via Avantis on Base) ────────────────
  registry.register({
    name: "leverage_open",
    description: "Open a leveraged position (long or short) on crypto, forex, or commodities via Avantis. Up to 50x crypto, 100x forex/commodities.",
    category: "leverage",
    parameters: [
      { name: "direction", type: "string", description: "long or short", required: true },
      { name: "asset", type: "string", description: "Asset to trade (e.g., ETH, BTC, SOL, Gold, EUR/USD)", required: true },
      { name: "leverage", type: "string", description: "Leverage multiplier (e.g., 5, 10, 20)", required: true },
      { name: "amount", type: "string", description: "Collateral amount in dollars (e.g., 50)", required: true },
      { name: "stop_loss", type: "string", description: "Stop loss price or percentage", required: false },
      { name: "take_profit", type: "string", description: "Take profit price or percentage", required: false },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      let prompt = `Open a ${params.leverage}x ${params.direction} on ${params.asset} with $${params.amount}`;
      if (params.stop_loss) prompt += ` with stop loss at ${params.stop_loss}`;
      if (params.take_profit) prompt += ` and take profit at ${params.take_profit}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "Position opened" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "leverage_close",
    description: "Close a leveraged position on Avantis",
    category: "leverage",
    parameters: [
      { name: "asset", type: "string", description: "Asset to close (e.g., ETH, BTC)", required: true },
      { name: "percentage", type: "string", description: "Percentage to close (default 100)", required: false },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const pct = params.percentage || "100";
      const result = await bankrPrompt(`Close ${pct}% of my ${params.asset} position on Avantis`);
      return result.success ? result.response || "Position closed" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "leverage_positions",
    description: "View all open leveraged positions on Avantis with P&L",
    category: "leverage",
    parameters: [],
    execute: async () => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt("Show my Avantis positions with P&L, entry price, liquidation price, and current value");
      return result.success ? result.response || "No positions" : `Failed: ${result.error}`;
    },
  });

  // ── AUTOMATION SKILLS (DCA, Limit Orders, Stop Loss) ──────
  registry.register({
    name: "set_limit_order",
    description: "Set a limit order to buy or sell a token at a target price",
    category: "automation",
    parameters: [
      { name: "action", type: "string", description: "buy or sell", required: true },
      { name: "token", type: "string", description: "Token symbol (e.g., ETH, PEPE)", required: true },
      { name: "price", type: "string", description: "Target price to execute at", required: true },
      { name: "amount", type: "string", description: "Amount or dollar value", required: false },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      let prompt = `Set a limit order to ${params.action} ${params.token} at ${params.price}`;
      if (params.amount) prompt += ` for ${params.amount}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "Limit order set" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "set_stop_loss_order",
    description: "Set a stop loss order to automatically sell a token if price drops",
    category: "automation",
    parameters: [
      { name: "token", type: "string", description: "Token symbol", required: true },
      { name: "price_or_pct", type: "string", description: "Stop price or percentage drop", required: true },
      { name: "amount", type: "string", description: "Amount to sell (e.g., '50%' or 'all')", required: false },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const amt = params.amount || "all";
      const result = await bankrPrompt(`Set stop loss for ${amt} of my ${params.token} at ${params.price_or_pct}`);
      return result.success ? result.response || "Stop loss set" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "setup_dca",
    description: "Set up Dollar Cost Averaging — automatically buy a token at regular intervals",
    category: "automation",
    parameters: [
      { name: "token", type: "string", description: "Token to DCA into (e.g., ETH, BTC, SOL)", required: true },
      { name: "amount", type: "string", description: "Dollar amount per purchase", required: true },
      { name: "interval", type: "string", description: "Frequency: hourly, daily, weekly, monthly", required: true },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt(`DCA $${params.amount} into ${params.token} every ${params.interval}`);
      return result.success ? result.response || "DCA set up" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "setup_twap",
    description: "Set up TWAP (Time-Weighted Average Price) — spread a large order over time",
    category: "automation",
    parameters: [
      { name: "action", type: "string", description: "buy or sell", required: true },
      { name: "token", type: "string", description: "Token symbol", required: true },
      { name: "amount", type: "string", description: "Total dollar amount", required: true },
      { name: "duration", type: "string", description: "Time to spread over (e.g., '4 hours')", required: true },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt(`TWAP: ${params.action} $${params.amount} of ${params.token} over ${params.duration}`);
      return result.success ? result.response || "TWAP set up" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "view_automations",
    description: "View all active automations — limit orders, stop losses, DCA, TWAP",
    category: "automation",
    parameters: [],
    execute: async () => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt("Show all my active automations, limit orders, stop losses, DCA schedules, and TWAP orders");
      return result.success ? result.response || "No active automations" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "cancel_automation",
    description: "Cancel an active automation (limit order, stop loss, DCA, etc.)",
    category: "automation",
    parameters: [
      { name: "description", type: "string", description: "Describe which automation to cancel", required: true },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt(`Cancel my automation: ${params.description}`);
      return result.success ? result.response || "Cancelled" : `Failed: ${result.error}`;
    },
  });

  // ── NFT SKILLS ────────────────────────────────────────────
  registry.register({
    name: "nft_browse",
    description: "Browse NFT collections — check floor prices, listings, and trending collections",
    category: "nft",
    parameters: [
      { name: "query", type: "string", description: "Collection name or search query", required: true },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt(`NFT: ${params.query}`);
      return result.success ? result.response || "No data" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "nft_buy",
    description: "Buy an NFT from a collection (cheapest listing or specific token ID)",
    category: "nft",
    parameters: [
      { name: "collection", type: "string", description: "Collection name", required: true },
      { name: "token_id", type: "string", description: "Specific token ID (leave empty for cheapest)", required: false },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const prompt = params.token_id
        ? `Buy ${params.collection} #${params.token_id}`
        : `Buy the cheapest ${params.collection}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "NFT purchased" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "nft_portfolio",
    description: "View your NFT portfolio — all NFTs you own across chains",
    category: "nft",
    parameters: [],
    execute: async () => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt("Show my NFTs across all chains with floor prices and total value");
      return result.success ? result.response || "No NFTs" : `Failed: ${result.error}`;
    },
  });

  // ── TOKEN DEPLOYMENT SKILLS ───────────────────────────────
  registry.register({
    name: "deploy_token_base",
    description: "Deploy a new ERC-20 token on Base via Clanker",
    category: "token_deploy",
    parameters: [
      { name: "name", type: "string", description: "Token name (e.g., 'MoonCoin')", required: true },
      { name: "symbol", type: "string", description: "Token symbol (e.g., 'MOON')", required: true },
      { name: "description", type: "string", description: "Brief description of the token", required: false },
    ],
    execute: async (params: any) => {
      let prompt = `Deploy a token called ${params.name} with symbol ${params.symbol} on Base`;
      if (params.description) prompt += `. Description: ${params.description}`;

      if (deps.x402Client && deps.x402Client.isAvailable()) {
        const result = await deps.x402Client.prompt(prompt);
        if (result.success) return result.response || "Token deployment submitted via x402";
      }

      if (!isBankrConfigured()) return "Token deployment requires x402 wallet or Bankr API key.";
      const result = await bankrPrompt(prompt);
      if (result.success) {
        const hasTx = result.transactions && result.transactions.length > 0;
        return (result.response || "Token deployment submitted") + (hasTx ? `\n\n📋 ${result.transactions!.length} transaction(s) returned.` : "");
      }
      return `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "deploy_token_solana",
    description: "Launch a new SPL token on Solana via Raydium LaunchLab",
    category: "token_deploy",
    parameters: [
      { name: "name", type: "string", description: "Token name", required: true },
      { name: "symbol", type: "string", description: "Token symbol", required: true },
      { name: "fee_recipient", type: "string", description: "Optional fee recipient address", required: false },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      let prompt = `Launch a token called ${params.name} with symbol ${params.symbol} on Solana`;
      if (params.fee_recipient) prompt += ` and give fees to ${params.fee_recipient}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "Token launched" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "claim_token_fees",
    description: "Claim creator fees from a deployed token",
    category: "token_deploy",
    parameters: [
      { name: "token", type: "string", description: "Token name or symbol", required: true },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt(`Claim my fees for ${params.token}`);
      return result.success ? result.response || "Fees claimed" : `Failed: ${result.error}`;
    },
  });

  // ── CROSS-CHAIN SKILLS ────────────────────────────────────
  registry.register({
    name: "bridge_tokens",
    description: "Bridge tokens between chains (Base, Ethereum, Polygon, Solana, Unichain)",
    category: "cross_chain",
    parameters: [
      { name: "amount", type: "string", description: "Amount to bridge", required: true },
      { name: "token", type: "string", description: "Token to bridge", required: true },
      { name: "from_chain", type: "string", description: "Source chain", required: true },
      { name: "to_chain", type: "string", description: "Destination chain", required: true },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt(`Bridge ${params.amount} ${params.token} from ${params.from_chain} to ${params.to_chain}`);
      return result.success ? result.response || "Bridge initiated" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "multi_chain_portfolio",
    description: "View portfolio across ALL chains with USD values",
    category: "cross_chain",
    parameters: [],
    execute: async () => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt("Show my complete portfolio across all chains with USD values and total");
      return result.success ? result.response || "No data" : `Failed: ${result.error}`;
    },
  });

  // ── TECHNICAL ANALYSIS ────────────────────────────────────
  registry.register({
    name: "technical_analysis",
    description: "Run technical analysis on a token — RSI, MACD, support/resistance, trend",
    category: "research",
    parameters: [
      { name: "token", type: "string", description: "Token to analyze", required: true },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt(`Do a full technical analysis on ${params.token}: RSI, MACD, support/resistance levels, trend direction, and trading recommendation. Be concise.`);
      return result.success ? result.response || "No data" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "compare_tokens",
    description: "Compare two or more tokens side-by-side",
    category: "research",
    parameters: [
      { name: "tokens", type: "string", description: "Tokens to compare (e.g., 'ETH vs SOL')", required: true },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt(`Compare ${params.tokens}: price, market cap, 24h volume, 24h change, and which is the better trade right now`);
      return result.success ? result.response || "No data" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "social_sentiment",
    description: "Check social sentiment and buzz for a token",
    category: "research",
    parameters: [
      { name: "token", type: "string", description: "Token to check sentiment for", required: true },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt(`What's the social sentiment for ${params.token}? Check Twitter buzz, community activity, and overall market mood.`);
      return result.success ? result.response || "No data" : `Failed: ${result.error}`;
    },
  });

  // ── TRANSFER SKILLS ───────────────────────────────────────
  registry.register({
    name: "send_to_social",
    description: "Send tokens to a social handle — Twitter, Farcaster, Telegram, or ENS",
    category: "transfer",
    parameters: [
      { name: "amount", type: "string", description: "Amount to send", required: true },
      { name: "token", type: "string", description: "Token to send", required: true },
      { name: "recipient", type: "string", description: "Social handle, ENS, or address", required: true },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt(`Send ${params.amount} ${params.token} to ${params.recipient}`);
      return result.success ? result.response || "Sent" : `Failed: ${result.error}`;
    },
  });

  // ── GENERAL BANKR SKILL ──────────────────────────────────
  registry.register({
    name: "bankr_prompt",
    description: "Send any custom prompt to Bankr AI for DeFi, trading, or blockchain queries",
    category: "defi",
    parameters: [
      { name: "prompt", type: "string", description: "The prompt to send to Bankr AI", required: true },
    ],
    execute: async (params: any) => {
      if (!isBankrConfigured()) return "Bankr API not configured";
      const result = await bankrPrompt(params.prompt);
      return result.success ? result.response || "No data" : `Failed: ${result.error}`;
    },
  });

  // ── TWITTER SKILLS ────────────────────────────────────────
  if (deps.twitterClient && deps.twitterClient.isAvailable()) {
    registry.register({
      name: "tweet",
      description: "Post a tweet to X (Twitter). Max 280 characters.",
      category: "social",
      parameters: [
        { name: "text", type: "string", description: "Tweet text (max 280 chars)", required: true },
      ],
      execute: async (params: any) => {
        const result = await deps.twitterClient!.tweet(params.text);
        return result.success ? `✅ Tweet posted: ${params.text}` : `❌ Tweet failed: ${result.error}`;
      },
    });

    registry.register({
      name: "tweet_trade_alert",
      description: "Post a trade alert tweet",
      category: "social",
      parameters: [
        { name: "token", type: "string", description: "Token symbol", required: true },
        { name: "entry", type: "string", description: "Entry price", required: true },
        { name: "target", type: "string", description: "Take profit target", required: true },
        { name: "stop_loss", type: "string", description: "Stop loss level", required: true },
      ],
      execute: async (params: any) => {
        const text = `🚀 TRADE ALERT: $${params.token}\n📍 Entry: ${params.entry}\n🎯 Target: ${params.target}\n🛑 SL: ${params.stop_loss}\n#DeFi #Trading`;
        const result = await deps.twitterClient!.tweet(text);
        return result.success ? `✅ Trade alert posted` : `❌ Failed: ${result.error}`;
      },
    });

    registry.register({
      name: "tweet_daily_report",
      description: "Post daily P&L report to Twitter",
      category: "social",
      parameters: [
        { name: "pnl", type: "string", description: "Daily P&L", required: true },
        { name: "win_rate", type: "string", description: "Win rate percentage", required: true },
        { name: "status", type: "string", description: "Status", required: true },
      ],
      execute: async (params: any) => {
        const text = `📊 Daily Report\n💰 P&L: ${params.pnl}\n📈 Win Rate: ${params.win_rate}\n🎯 Status: ${params.status}\n#AI #Trading #Autonomous`;
        const result = await deps.twitterClient!.tweet(text);
        return result.success ? `✅ Daily report posted` : `❌ Failed: ${result.error}`;
      },
    });

    registry.register({
      name: "tweet_gem_find",
      description: "Post a gem discovery tweet",
      category: "social",
      parameters: [
        { name: "token", type: "string", description: "Token symbol", required: true },
        { name: "mcap", type: "string", description: "Market cap", required: true },
        { name: "volume", type: "string", description: "24h volume", required: true },
        { name: "score", type: "string", description: "Viability score (0-100)", required: true },
      ],
      execute: async (params: any) => {
        const text = `💎 GEM FOUND: $${params.token}\n📊 MCap: ${params.mcap}\n💧 Vol: ${params.volume}\n⭐ Score: ${params.score}/100\n#LowCap #DeFi`;
        const result = await deps.twitterClient!.tweet(text);
        return result.success ? `✅ Gem post shared` : `❌ Failed: ${result.error}`;
      },
    });
  }

  // ── SELF-SUSTAINING AGENT SKILLS ──────────────────────────
  if (deps.x402Client && deps.x402Client.isAvailable()) {
    registry.register({
      name: "x402_prompt",
      description: "Send a prompt via Bankr x402 SDK (micropayment-based, $0.10/request)",
      category: "defi",
      parameters: [
        { name: "prompt", type: "string", description: "The prompt to send via x402", required: true },
      ],
      execute: async (params: any) => {
        const result = await deps.x402Client!.prompt(params.prompt);
        return result.success ? result.response || "No data" : `Failed: ${result.error}`;
      },
    });
  }

  if (deps.x402Client) {
    registry.register({
      name: "revenue_report",
      description: "Show the agent's revenue vs cost report",
      category: "utility",
      parameters: [],
      execute: async () => deps.x402Client!.getRevenueReport(),
    });

    registry.register({
      name: "set_daily_budget",
      description: "Set the agent's daily API spending budget",
      category: "utility",
      parameters: [
        { name: "amount", type: "number", description: "Daily budget in dollars", required: true },
      ],
      execute: async (params: any) => {
        deps.x402Client!.setDailyBudget(params.amount);
        return `✅ Daily budget set to $${params.amount}.`;
      },
    });

    registry.register({
      name: "track_trade_revenue",
      description: "Record revenue earned from a trade",
      category: "utility",
      parameters: [
        { name: "amount", type: "number", description: "Dollar amount of profit", required: true },
        { name: "source", type: "string", description: "Source of revenue", required: true },
      ],
      execute: async (params: any) => {
        deps.x402Client!.trackRevenue(params.amount);
        return `✅ Recorded $${params.amount} revenue from: ${params.source}. ${deps.x402Client!.isSustainable() ? "🟢 Self-sustaining!" : "🔴 Not yet sustainable"}`;
      },
    });
  }

  console.log(`✅ Registered ${registry.getAll().length} skills`);
}
