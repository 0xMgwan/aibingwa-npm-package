// ============================================================
// OPENCLAW SKILLS INTEGRATION — Beyond Bankr
// ============================================================

import { SkillRegistry } from "./skills.js";

export interface OpenClawSkillDeps {
  bankrPrompt?: (prompt: string) => Promise<{ success: boolean; response?: string; error?: string }>;
  executeAction?: (actionName: string, args?: Record<string, any>) => Promise<string>;
  getWalletAddress?: () => Promise<string>;
}

// ============================================================
// BOTCHAN — Onchain Agent Messaging
// ============================================================
export function registerBotchanSkills(registry: SkillRegistry, deps: OpenClawSkillDeps) {
  const { bankrPrompt } = deps;
  if (!bankrPrompt) return;

  registry.register({
    name: "botchan_post",
    description: "Post a message to the onchain agent messaging layer (Botchan) on Base blockchain. Messages are permanent and accessible to all agents.",
    category: "social",
    parameters: [
      { name: "message", type: "string", description: "Message content to post onchain", required: true },
      { name: "feed", type: "string", description: "Optional feed/topic to post to", required: false },
    ],
    execute: async (params: any) => {
      const prompt = params.feed 
        ? `Post "${params.message}" to Botchan feed "${params.feed}" on Base blockchain`
        : `Post "${params.message}" to Botchan on Base blockchain`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "Posted to Botchan" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "botchan_read_feed",
    description: "Read messages from a Botchan feed or agent profile",
    category: "social",
    parameters: [
      { name: "feed_or_address", type: "string", description: "Feed name or wallet address to read from", required: true },
      { name: "limit", type: "number", description: "Number of messages to fetch (default 10)", required: false },
    ],
    execute: async (params: any) => {
      const limit = params.limit || 10;
      const result = await bankrPrompt(`Read ${limit} latest messages from Botchan feed/profile "${params.feed_or_address}"`);
      return result.success ? result.response || "No messages found" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "botchan_message_agent",
    description: "Send a direct message to another agent via Botchan",
    category: "social",
    parameters: [
      { name: "agent_address", type: "string", description: "Wallet address of the agent to message", required: true },
      { name: "message", type: "string", description: "Message to send", required: true },
    ],
    execute: async (params: any) => {
      const result = await bankrPrompt(`Send Botchan message "${params.message}" to agent ${params.agent_address}`);
      return result.success ? result.response || "Message sent" : `Failed: ${result.error}`;
    },
  });
}

// ============================================================
// CLANKER — Advanced Token Deployment
// ============================================================
export function registerClankerSkills(registry: SkillRegistry, deps: OpenClawSkillDeps) {
  const { bankrPrompt } = deps;
  if (!bankrPrompt) return;

  registry.register({
    name: "clanker_deploy_advanced",
    description: "Deploy advanced ERC20 token with Clanker SDK - supports vesting, airdrops, custom market cap, anti-sniper protection",
    category: "token_deploy",
    parameters: [
      { name: "name", type: "string", description: "Token name", required: true },
      { name: "symbol", type: "string", description: "Token symbol", required: true },
      { name: "description", type: "string", description: "Token description", required: false },
      { name: "image_url", type: "string", description: "Token image URL", required: false },
      { name: "initial_market_cap", type: "number", description: "Initial market cap in USD", required: false },
      { name: "dev_buy_amount", type: "number", description: "Amount for dev to buy in USD", required: false },
      { name: "anti_sniper", type: "boolean", description: "Enable anti-sniper protection", required: false },
    ],
    execute: async (params: any) => {
      let prompt = `Deploy advanced token "${params.name}" (${params.symbol}) using Clanker SDK`;
      if (params.description) prompt += ` with description: ${params.description}`;
      if (params.initial_market_cap) prompt += ` with initial market cap $${params.initial_market_cap}`;
      if (params.dev_buy_amount) prompt += ` and dev buy $${params.dev_buy_amount}`;
      if (params.anti_sniper) prompt += ` with anti-sniper protection enabled`;
      if (params.image_url) prompt += ` and image: ${params.image_url}`;
      
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "Token deployed with Clanker" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "clanker_airdrop",
    description: "Create airdrop for a Clanker token",
    category: "token_deploy",
    parameters: [
      { name: "token_address", type: "string", description: "Token contract address", required: true },
      { name: "recipients", type: "string", description: "Comma-separated list of recipient addresses", required: true },
      { name: "amounts", type: "string", description: "Comma-separated list of amounts (same order as recipients)", required: true },
    ],
    execute: async (params: any) => {
      const result = await bankrPrompt(`Create airdrop for token ${params.token_address} to recipients ${params.recipients} with amounts ${params.amounts}`);
      return result.success ? result.response || "Airdrop created" : `Failed: ${result.error}`;
    },
  });
}

// ============================================================
// ENDAOMENT — Charity Donations
// ============================================================
export function registerEndaomentSkills(registry: SkillRegistry, deps: OpenClawSkillDeps) {
  const { bankrPrompt } = deps;
  if (!bankrPrompt) return;

  registry.register({
    name: "donate_to_charity",
    description: "Donate crypto to 501(c)(3) charities via Endaoment. Supports popular charities like GiveDirectly, Red Cross, Doctors Without Borders.",
    category: "charity",
    parameters: [
      { name: "charity", type: "string", description: "Charity name or EIN (e.g., 'GiveDirectly' or '27-1661997')", required: true },
      { name: "amount", type: "string", description: "Amount to donate in USD", required: true },
      { name: "token", type: "string", description: "Token to donate (default USDC)", required: false },
    ],
    execute: async (params: any) => {
      const token = params.token || "USDC";
      const result = await bankrPrompt(`Donate $${params.amount} ${token} to charity "${params.charity}" via Endaoment on Base`);
      return result.success ? result.response || "Donation completed" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "search_charities",
    description: "Search for charities available on Endaoment",
    category: "charity",
    parameters: [
      { name: "query", type: "string", description: "Charity name or cause to search for", required: true },
    ],
    execute: async (params: any) => {
      const result = await bankrPrompt(`Search for charities matching "${params.query}" on Endaoment`);
      return result.success ? result.response || "No charities found" : `Failed: ${result.error}`;
    },
  });
}

// ============================================================
// ENS — Enhanced Name Service
// ============================================================
export function registerENSSkills(registry: SkillRegistry, deps: OpenClawSkillDeps) {
  const { bankrPrompt } = deps;
  if (!bankrPrompt) return;

  registry.register({
    name: "ens_resolve_name",
    description: "Resolve ENS name to address or get primary name for address",
    category: "identity",
    parameters: [
      { name: "name_or_address", type: "string", description: "ENS name (e.g., vitalik.eth) or address", required: true },
    ],
    execute: async (params: any) => {
      const result = await bankrPrompt(`Resolve ENS "${params.name_or_address}"`);
      return result.success ? result.response || "Not found" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "ens_set_primary_name",
    description: "Set primary ENS name for your address",
    category: "identity",
    parameters: [
      { name: "ens_name", type: "string", description: "ENS name to set as primary", required: true },
    ],
    execute: async (params: any) => {
      const result = await bankrPrompt(`Set primary ENS name to "${params.ens_name}"`);
      return result.success ? result.response || "Primary name set" : `Failed: ${result.error}`;
    },
  });
}

// ============================================================
// VEIL — Privacy Transactions
// ============================================================
export function registerVeilSkills(registry: SkillRegistry, deps: OpenClawSkillDeps) {
  const { bankrPrompt } = deps;
  if (!bankrPrompt) return;

  registry.register({
    name: "veil_private_transfer",
    description: "Send private/shielded transactions via Veil Cash for enhanced privacy",
    category: "privacy",
    parameters: [
      { name: "amount", type: "string", description: "Amount to send privately", required: true },
      { name: "token", type: "string", description: "Token to send (default ETH)", required: false },
      { name: "recipient", type: "string", description: "Recipient address or ENS", required: true },
    ],
    execute: async (params: any) => {
      const token = params.token || "ETH";
      const result = await bankrPrompt(`Send ${params.amount} ${token} privately to ${params.recipient} via Veil Cash`);
      return result.success ? result.response || "Private transfer completed" : `Failed: ${result.error}`;
    },
  });
}

// ============================================================
// QRCOIN — QR Code Auctions
// ============================================================
export function registerQRCoinSkills(registry: SkillRegistry, deps: OpenClawSkillDeps) {
  const { bankrPrompt } = deps;
  if (!bankrPrompt) return;

  registry.register({
    name: "qrcoin_create_auction",
    description: "Create QR code auction on QRCoin platform",
    category: "nft",
    parameters: [
      { name: "qr_data", type: "string", description: "Data to encode in QR code", required: true },
      { name: "starting_price", type: "string", description: "Starting auction price in ETH", required: true },
      { name: "duration_hours", type: "number", description: "Auction duration in hours", required: false },
    ],
    execute: async (params: any) => {
      const duration = params.duration_hours || 24;
      const result = await bankrPrompt(`Create QRCoin auction for "${params.qr_data}" starting at ${params.starting_price} ETH for ${duration} hours`);
      return result.success ? result.response || "QR auction created" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "qrcoin_bid",
    description: "Bid on QRCoin auction",
    category: "nft",
    parameters: [
      { name: "auction_id", type: "string", description: "Auction ID to bid on", required: true },
      { name: "bid_amount", type: "string", description: "Bid amount in ETH", required: true },
    ],
    execute: async (params: any) => {
      const result = await bankrPrompt(`Bid ${params.bid_amount} ETH on QRCoin auction ${params.auction_id}`);
      return result.success ? result.response || "Bid placed" : `Failed: ${result.error}`;
    },
  });
}

// ============================================================
// YOINK — Capture The Flag Game
// ============================================================
export function registerYoinkSkills(registry: SkillRegistry, deps: OpenClawSkillDeps) {
  const { bankrPrompt } = deps;
  if (!bankrPrompt) return;

  registry.register({
    name: "yoink_capture_flag",
    description: "Capture the flag in Yoink game",
    category: "gaming",
    parameters: [
      { name: "flag_id", type: "string", description: "Flag ID to capture", required: true },
      { name: "strategy", type: "string", description: "Capture strategy or message", required: false },
    ],
    execute: async (params: any) => {
      let prompt = `Capture flag ${params.flag_id} in Yoink game`;
      if (params.strategy) prompt += ` with strategy: ${params.strategy}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "Flag captured!" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "yoink_check_leaderboard",
    description: "Check Yoink game leaderboard and stats",
    category: "gaming",
    parameters: [],
    execute: async () => {
      const result = await bankrPrompt("Show Yoink game leaderboard and my stats");
      return result.success ? result.response || "No stats available" : `Failed: ${result.error}`;
    },
  });
}

// ============================================================
// ERC-8004 — Agent Registration
// ============================================================
export function registerERC8004Skills(registry: SkillRegistry, deps: OpenClawSkillDeps) {
  const { bankrPrompt } = deps;
  if (!bankrPrompt) return;

  registry.register({
    name: "register_agent",
    description: "Register agent identity onchain via ERC-8004 standard",
    category: "identity",
    parameters: [
      { name: "agent_name", type: "string", description: "Agent name/identifier", required: true },
      { name: "description", type: "string", description: "Agent description", required: false },
      { name: "capabilities", type: "string", description: "Comma-separated list of capabilities", required: false },
    ],
    execute: async (params: any) => {
      let prompt = `Register agent "${params.agent_name}" onchain via ERC-8004`;
      if (params.description) prompt += ` with description: ${params.description}`;
      if (params.capabilities) prompt += ` and capabilities: ${params.capabilities}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "Agent registered" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "lookup_agent",
    description: "Look up registered agent by address or name",
    category: "identity",
    parameters: [
      { name: "agent_identifier", type: "string", description: "Agent address or name", required: true },
    ],
    execute: async (params: any) => {
      const result = await bankrPrompt(`Look up agent "${params.agent_identifier}" in ERC-8004 registry`);
      return result.success ? result.response || "Agent not found" : `Failed: ${result.error}`;
    },
  });
}

// ============================================================
// MASTER REGISTRATION FUNCTION
// ============================================================
export function registerAllOpenClawSkills(registry: SkillRegistry, deps: OpenClawSkillDeps) {
  console.log("🔧 Registering OpenClaw skills...");
  
  registerBotchanSkills(registry, deps);
  registerClankerSkills(registry, deps);
  registerEndaomentSkills(registry, deps);
  registerENSSkills(registry, deps);
  registerVeilSkills(registry, deps);
  registerQRCoinSkills(registry, deps);
  registerYoinkSkills(registry, deps);
  registerERC8004Skills(registry, deps);
  
  console.log("✅ OpenClaw skills registered");
}
