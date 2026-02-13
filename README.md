<p align="center">
  <h1 align="center">🤖 AIBINGWA Agent</h1>
  <p align="center">
    <strong>Autonomous AI trading Agent & ofcourse alot more! </strong>
  </p>
  <p align="center">
    Self-sustaining DeFi agent with LLM reasoning, pluggable skill system, x402 micropayments, autonomous trading engine, and Twitter/X integration.
  </p>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#skills-system">Skills</a> •
  <a href="#autonomous-trading">Trading</a> •
  <a href="#api-reference">API</a>
</p>

---

## What is AIBINGWA?

AIBINGWA is a modular, open-source AI agent framework designed for autonomous DeFi trading, analysis, autoexecution and alot more than just trading. You feed it skills. It combines:

- **GPT-4o reasoning** — LLM brain that understands markets, evaluates risk, and makes trading decisions
- **Bankr Agent API** — Execute swaps, research tokens, deploy contracts, and more on Base
- **x402 micropayments** — Pay-per-request API access using USDC on Base (self-sustaining model)
- **Autonomous trading** — 24/7 market scanning, position monitoring, auto take-profit/stop-loss
- **Pluggable skills** — Register custom tools the LLM can invoke via OpenAI function calling
- **Persistent memory** — Trade journal, token research, learnings, and performance tracking
- **Twitter/X integration** — Post trade alerts, market updates, and engage on social media

Built to be imported into any Node.js project — Telegram bots, Discord bots, web apps, CLI tools, or standalone scripts.

---

## Features

### 🧠 LLM Brain (AgentBrain)
- GPT-4o powered reasoning with configurable model and system prompt
- Per-user conversation memory with context window management
- OpenAI function calling integration — the LLM decides which skills to use
- Reflection loop — learns from interactions and improves over time
- Survival-mode trading persona with risk management built into the prompt

### 🔧 Pluggable Skill System (SkillRegistry)
- Register any number of custom skills with typed parameters
- Skills auto-convert to OpenAI function calling format
- Built-in categories: `wallet`, `trading`, `research`, `social`, `utility`, `defi`, `prediction`, `leverage`, `automation`, `nft`, `token_deploy`, `cross_chain`, `transfer`
- Skills are described in the system prompt so the LLM knows what's available

### 📊 Autonomous Trading Engine (AutonomousTrader)
- Periodic market scanning for low-cap gems (configurable interval)
- Multi-step pipeline: Scan → Research → Score → Execute → Monitor
- Auto take-profit and stop-loss with configurable thresholds
- Position tracking with max open positions limit
- Notification callbacks for trade alerts
- Manual research and settings override

### 💰 x402 Micropayments (BankrX402Client)
- Pay-per-request Bankr API access using USDC on Base
- Revenue vs cost tracking — aim for self-sustainability
- Daily budget limits to prevent overspending
- ROI reporting and sustainability status
- Automatic fallback to API key mode if x402 not configured

### 🧠 Persistent Memory (AgentMemory)
- Trade journal with entry/exit tracking and P&L calculation
- Token research database with scores, sentiment, and history
- Learning log — agent remembers what worked and what didn't
- Win rate tracking and performance summaries
- Configurable data directory for persistence across deploys

### 🐦 Twitter/X Integration (TwitterClient)
- Post tweets, replies, quote tweets
- Like and retweet
- OAuth 1.0a authentication via official `twitter-api-v2` library
- Optional — gracefully disabled if no credentials provided

---

## Quick Start

### Installation

```bash
npm install aibingwa-agent
```

Or clone and link locally:

```bash
git clone https://github.com/0xMgwan/aibingwa-package.git
cd aibingwa-package
npm install
npm run build
npm link
```

### Minimal Example

```typescript
import { AgentBingwa } from "aibingwa-agent";

const agent = new AgentBingwa({
  openaiApiKey: process.env.OPENAI_API_KEY,
  bankrApiKey: process.env.BANKR_API_KEY,
});

// Register a custom skill
agent.skills.register({
  name: "say_hello",
  description: "Greet the user",
  category: "utility",
  parameters: [
    { name: "name", type: "string", description: "User's name", required: true },
  ],
  execute: async (params) => `Hello, ${params.name}! 👋`,
});

// Process a message
const response = await agent.processMessage("user123", "Alice", "Hey, what can you do?");
console.log(response);
```

### Telegram Bot Example

```typescript
import { Bot } from "grammy";
import { AgentBingwa } from "aibingwa-agent";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

const agent = new AgentBingwa({
  openaiApiKey: process.env.OPENAI_API_KEY,
  bankrApiKey: process.env.BANKR_API_KEY,
  onNotify: async (msg) => {
    await bot.api.sendMessage(process.env.OWNER_CHAT_ID!, msg, { parse_mode: "Markdown" });
  },
});

// Register your DeFi skills here...
// agent.skills.register({ ... });

// Start autonomous trading
agent.startTrading();

bot.on("message:text", async (ctx) => {
  const reply = await agent.processMessage(
    ctx.chat.id.toString(),
    ctx.from?.first_name || "anon",
    ctx.message.text,
  );
  await ctx.reply(reply, { parse_mode: "Markdown" });
});

bot.start();
```

### Using Individual Modules

You don't have to use the all-in-one `AgentBingwa` class. Import only what you need:

```typescript
import {
  SkillRegistry,
  AgentBrain,
  AutonomousTrader,
  BankrX402Client,
  TwitterClient,
  loadMemory,
  saveMemory,
  setDataDir,
} from "aibingwa-agent";

// Use the skill registry standalone
const skills = new SkillRegistry();
skills.register({ /* ... */ });

// Use the brain with your own skills
const brain = new AgentBrain(skills, { model: "gpt-4o" });

// Use x402 client for micropayment-based API access
const x402 = new BankrX402Client({ privateKey: "0x..." });
const result = await x402.prompt("What is the price of ETH?");

// Use Twitter client standalone
const twitter = new TwitterClient({
  appKey: "...",
  appSecret: "...",
  accessToken: "...",
  accessSecret: "...",
});
await twitter.tweet("GM from AIBINGWA! 🤖");
```

---

## Architecture

```
aibingwa-agent/
├── src/
│   ├── index.ts          # Main entry — AgentBingwa class + re-exports
│   ├── skills.ts         # SkillRegistry — pluggable tool system
│   ├── brain.ts          # AgentBrain — LLM reasoning engine
│   ├── memory.ts         # Persistent memory — trades, tokens, learnings
│   ├── autonomous.ts     # AutonomousTrader — market scanning & trading
│   ├── bankr-x402.ts     # BankrX402Client — x402 micropayment client
│   └── twitter.ts        # TwitterClient — X API v2 integration
├── dist/                 # Built output (ESM + types)
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

### Module Dependency Graph

```
AgentBingwa (index.ts)
├── SkillRegistry (skills.ts)
├── AgentBrain (brain.ts)
│   ├── SkillRegistry
│   └── AgentMemory (memory.ts)
├── AutonomousTrader (autonomous.ts)
│   └── AgentMemory (memory.ts)
├── BankrX402Client (bankr-x402.ts)
│   └── AgentMemory (memory.ts)
└── TwitterClient (twitter.ts)
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | **Yes** | OpenAI API key for GPT-4o reasoning |
| `BANKR_API_KEY` | Recommended | Bankr Agent API key for DeFi operations |
| `X402_PRIVATE_KEY` | Optional | Private key for x402 micropayment wallet |
| `X402_WALLET_ADDRESS` | Optional | Wallet address (auto-derived if not set) |
| `WALLET_PRIVATE_KEY` | Optional | Fallback private key for x402 |
| `X_CONSUMER_KEY` | Optional | Twitter/X OAuth consumer key |
| `X_CONSUMER_SECRET` | Optional | Twitter/X OAuth consumer secret |
| `X_ACCESS_TOKEN` | Optional | Twitter/X OAuth access token |
| `X_ACCESS_TOKEN_SECRET` | Optional | Twitter/X OAuth access token secret |

### Trading Settings (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_MARKET_CAP` | `40000` | Max market cap ($) for token scanning |
| `MAX_BUY_AMOUNT` | `5` | Max buy amount ($) per trade |
| `TAKE_PROFIT_PCT` | `100` | Take profit percentage |
| `STOP_LOSS_PCT` | `30` | Stop loss percentage |
| `SCAN_INTERVAL_MIN` | `30` | Market scan interval (minutes) |
| `AUTO_TRADE` | `false` | Enable autonomous trading |
| `MAX_OPEN_POSITIONS` | `5` | Maximum concurrent open positions |

### AgentBingwaConfig

```typescript
interface AgentBingwaConfig {
  openaiApiKey?: string;       // OpenAI API key
  model?: string;              // LLM model (default: "gpt-4o")
  systemPrompt?: string;       // Custom system prompt with {{SKILLS}} placeholder
  bankrApiKey?: string;        // Bankr Agent API key
  x402PrivateKey?: string;     // x402 micropayment private key
  x402WalletAddress?: string;  // x402 wallet address
  twitter?: {                  // Twitter/X credentials
    appKey: string;
    appSecret: string;
    accessToken: string;
    accessSecret: string;
  };
  dataDir?: string;            // Persistent data directory (default: ./data)
  ownerChatId?: string;        // Owner chat ID for notifications
  onNotify?: (msg: string) => Promise<void>;  // Notification callback
}
```

---

## Skills System

Skills are the tools your agent can use. The LLM decides which skills to call based on the user's message.

### Registering a Skill

```typescript
import { AgentBingwa } from "aibingwa-agent";

const agent = new AgentBingwa({ openaiApiKey: "..." });

agent.skills.register({
  name: "check_price",
  description: "Check the current price of a token on Base",
  category: "research",
  parameters: [
    {
      name: "token",
      type: "string",
      description: "Token symbol or address",
      required: true,
    },
  ],
  execute: async (params) => {
    // Your implementation — call an API, query on-chain, etc.
    const price = await fetchTokenPrice(params.token);
    return `${params.token} is currently $${price}`;
  },
});
```

### Skill Categories

| Category | Description |
|----------|-------------|
| `wallet` | Balance checks, wallet info |
| `trading` | Buy, sell, swap tokens |
| `research` | Token analysis, market scanning |
| `social` | Twitter posting, community engagement |
| `utility` | General tools, settings, help |
| `defi` | Lending, staking, yield farming |
| `prediction` | Prediction markets (Polymarket) |
| `leverage` | Leveraged trading (Avantis) |
| `automation` | DCA, limit orders, TWAP |
| `nft` | NFT browsing, buying, selling |
| `token_deploy` | Launch ERC-20 (Clanker) or SPL tokens |
| `cross_chain` | Bridge tokens between chains |
| `transfer` | Send tokens to addresses |

### Skill Parameter Types

```typescript
interface SkillParameter {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
  enum?: string[];  // Optional: restrict to specific values
}
```

---

## Autonomous Trading

The `AutonomousTrader` runs a continuous loop:

1. **Scan** — Queries Bankr for low-cap tokens under your market cap threshold
2. **Research** — Scores each candidate on volume, momentum, liquidity, risk
3. **Execute** — Auto-buys tokens scoring 60+ (if auto-trade enabled)
4. **Monitor** — Checks open positions every 5 minutes
5. **Exit** — Auto-sells at take-profit or stop-loss thresholds

### Starting the Trader

```typescript
const agent = new AgentBingwa({
  openaiApiKey: "...",
  bankrApiKey: "...",
  onNotify: async (msg) => console.log("ALERT:", msg),
});

// Start autonomous scanning + monitoring
agent.startTrading();

// Update settings at runtime
agent.trader?.updateSettings({
  maxMarketCap: 50000,
  maxBuyAmount: "10",
  takeProfitPct: 80,
  stopLossPct: 25,
  autoTradeEnabled: true,
});

// Toggle auto-trade
agent.trader?.toggleAutoTrade(true);

// Manual research
const analysis = await agent.trader?.manualResearch("DEGEN");
console.log(analysis);

// Stop trading
agent.stopTrading();
```

### Trading Memory

All trades are persisted to disk in `data/memory.json`:

```json
{
  "trades": [
    {
      "id": "trade_1234_abc",
      "token": "DEGEN",
      "symbol": "DEGEN",
      "action": "buy",
      "amount": "$5",
      "price": "0.0042",
      "marketCap": "35000",
      "timestamp": 1700000000000,
      "reason": "Score 72/100: High volume, growing holders",
      "status": "open"
    }
  ],
  "tokens": {
    "DEGEN": {
      "symbol": "DEGEN",
      "lastResearched": 1700000000000,
      "researchSummary": "Strong momentum, good liquidity",
      "score": 72,
      "timesTraded": 1,
      "totalPnl": 0
    }
  },
  "learnings": [
    "✅ DEGEN: +45% — High volume breakout pattern"
  ],
  "totalTrades": 1,
  "winRate": 0,
  "totalPnl": 0
}
```

---

## API Reference

### AgentBingwa

| Method | Description |
|--------|-------------|
| `processMessage(chatId, userName, message, statusCallback?)` | Process a user message through the LLM brain |
| `startTrading()` | Start autonomous market scanning and position monitoring |
| `stopTrading()` | Stop autonomous trading |
| `getSkillCount()` | Get number of registered skills |
| `isBrainOnline()` | Check if LLM brain is initialized |
| `isTraderActive()` | Check if autonomous trader is initialized |

### SkillRegistry

| Method | Description |
|--------|-------------|
| `register(skill)` | Register a new skill |
| `get(name)` | Get a skill by name |
| `getAll()` | Get all registered skills |
| `getByCategory(category)` | Get skills by category |
| `toOpenAITools()` | Convert to OpenAI function calling format |
| `describeSkills()` | Get human-readable skill descriptions |

### AgentBrain

| Method | Description |
|--------|-------------|
| `processMessage(chatId, userName, message, statusCallback?)` | Process message with LLM reasoning + skill execution |
| `reloadMemory()` | Reload agent memory from disk |
| `getSkillCount()` | Get number of available skills |

### AutonomousTrader

| Method | Description |
|--------|-------------|
| `start()` | Start scanning and monitoring timers |
| `stop()` | Stop all timers |
| `scanMarket()` | Manually trigger a market scan |
| `monitorPositions()` | Manually check open positions |
| `manualResearch(token)` | Research a specific token |
| `updateSettings(updates)` | Update trading settings |
| `toggleAutoTrade(enabled)` | Enable/disable auto-trading |
| `getMemory()` | Get current agent memory |
| `reloadMemory()` | Reload memory from disk |

### BankrX402Client

| Method | Description |
|--------|-------------|
| `isAvailable()` | Check if x402 is configured |
| `prompt(text)` | Send a prompt via x402 micropayment |
| `trackRevenue(amount)` | Log revenue from a trade |
| `getRevenueReport()` | Get formatted revenue vs cost report |
| `isSustainable()` | Check if revenue exceeds costs |
| `setDailyBudget(amount)` | Set daily spending limit |

### TwitterClient

| Method | Description |
|--------|-------------|
| `isAvailable()` | Check if Twitter is configured |
| `tweet(text)` | Post a tweet |
| `replyToTweet(tweetId, text)` | Reply to a tweet |
| `quoteTweet(tweetId, text)` | Quote tweet |
| `likeTweet(tweetId)` | Like a tweet |
| `retweet(tweetId)` | Retweet |
| `getMe()` | Get authenticated user info |

### Memory Functions

| Function | Description |
|----------|-------------|
| `loadMemory()` | Load agent memory from disk |
| `saveMemory(memory)` | Save agent memory to disk |
| `setDataDir(dir)` | Set custom data directory |
| `logTrade(memory, trade)` | Log a new trade |
| `closeTrade(memory, tradeId, exitPrice, pnl)` | Close a trade with P&L |
| `updateTokenMemory(memory, symbol, data)` | Update token research data |
| `getOpenPositions(memory)` | Get all open positions |
| `getTradeHistory(memory, limit?)` | Get recent trade history |
| `getPerformanceSummary(memory)` | Get formatted performance report |

---

## DeFi Capabilities

When connected to Bankr Agent API, AIBINGWA can:

| Capability | Description |
|------------|-------------|
| **Token Swaps** | Buy/sell any ERC-20 on Base |
| **Token Research** | Price, volume, holders, liquidity analysis |
| **Market Scanning** | Find trending low-cap tokens |
| **Leverage Trading** | Long/short up to 50x crypto, 100x forex via Avantis |
| **DCA Orders** | Dollar-cost averaging automation |
| **Limit Orders** | Set buy/sell at target prices |
| **Stop Loss** | Automatic position protection |
| **TWAP Orders** | Time-weighted average price execution |
| **Cross-Chain Bridge** | Bridge tokens between Base, Ethereum, Polygon, Solana |
| **Token Deployment** | Launch ERC-20 on Base (Clanker) or SPL on Solana |
| **NFT Trading** | Browse, buy, sell NFTs across chains |
| **Prediction Markets** | Polymarket betting and odds checking |
| **ENS Resolution** | Resolve .eth names to addresses |
| **Technical Analysis** | RSI, MACD, support/resistance levels |

---

## Self-Sustaining Model

AIBINGWA tracks its own costs and revenue to aim for self-sustainability:

```
📊 Revenue & Cost Report
💰 Total Earned: $12.50
💸 Total Spent (API): $3.20
📈 Net P&L: +$9.30
📊 ROI: 290.6%
🔢 Total Requests: 32
💵 Avg Cost/Request: $0.100
📅 Today's Spend: $0.80 / $5.00
✅ SELF-SUSTAINING — Revenue covers costs!
```

The x402 micropayment system charges ~$0.10 USDC per Bankr API request. The agent tracks every cost and compares it against trading profits to determine if it's covering its own expenses.

---

## Requirements

- **Node.js** >= 20.0.0
- **OpenAI API key** — for LLM reasoning
- **Bankr API key** or **x402 wallet with USDC on Base** — for DeFi operations
- **Twitter API credentials** (optional) — for X integration (requires Basic tier, $100/mo)

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## License

MIT © [0xMgwan](https://github.com/0xMgwan)

---

<p align="center">
  <strong>Built with 🔥 by AIBINGWA</strong><br>
  <em>Trade smart. Trade autonomous. Stay alive.</em>
</p>
