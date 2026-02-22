/**
 * Type definitions for AIBINGWA agent
 */

export interface UserProfile {
  chatId: string;
  name: string;
  preferences: string[];
  conversationHistory: ConversationMessage[];
  lastSeen: number;
  interactionCount: number;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface TradingPreferences {
  riskTolerance: "low" | "medium" | "high";
  maxPositionSize: number;
  preferredTokens: string[];
  autoTradeEnabled: boolean;
}

export interface NotificationSettings {
  tradeAlerts: boolean;
  priceAlerts: boolean;
  portfolioUpdates: boolean;
  riskWarnings: boolean;
}
