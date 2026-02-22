/**
 * Execution safety system for AIBINGWA agent
 * Rate limiting, idempotent execution, error classification
 */

import { logger } from "./observability.js";

export interface ExecutionRequest {
  id: string;
  type: "trade" | "scan" | "research" | "polymarket_bet";
  userId: string;
  params: Record<string, any>;
  timestamp: number;
  retryCount: number;
}

export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: ClassifiedError;
  latency: number;
  cached: boolean;
}

export interface ClassifiedError {
  type: "network" | "insufficient_balance" | "market_closed" | "rate_limit" | "invalid_params" | "system";
  message: string;
  retryable: boolean;
  backoffMs: number;
}

export class ExecutionSafetyManager {
  private executionHistory: Map<string, ExecutionResult> = new Map();
  private rateLimits: Map<string, RateLimitState> = new Map();
  private pendingExecutions: Set<string> = new Set();

  private readonly RATE_LIMITS = {
    trade: { requests: 10, windowMs: 60000 }, // 10 trades per minute
    scan: { requests: 60, windowMs: 60000 }, // 60 scans per minute
    research: { requests: 30, windowMs: 60000 }, // 30 research calls per minute
    polymarket_bet: { requests: 5, windowMs: 60000 }, // 5 bets per minute
  };

  /**
   * Execute request with safety checks
   */
  async safeExecute<T>(
    request: Omit<ExecutionRequest, "timestamp" | "retryCount">,
    executor: () => Promise<T>
  ): Promise<ExecutionResult> {
    const fullRequest: ExecutionRequest = {
      ...request,
      timestamp: Date.now(),
      retryCount: 0,
    };

    // Check for duplicate execution
    if (this.pendingExecutions.has(request.id)) {
      return {
        success: false,
        error: {
          type: "system",
          message: "Duplicate execution prevented",
          retryable: false,
          backoffMs: 0,
        },
        latency: 0,
        cached: false,
      };
    }

    // Check rate limits
    const rateLimitCheck = this.checkRateLimit(request.type, request.userId);
    if (!rateLimitCheck.allowed) {
      logger.logAlert({
        level: "warning",
        category: "rate_limit",
        message: `Rate limit exceeded for ${request.type}`,
        metadata: { userId: request.userId, type: request.type },
      });

      return {
        success: false,
        error: {
          type: "rate_limit",
          message: `Rate limit exceeded. Try again in ${Math.ceil(rateLimitCheck.retryAfterMs / 1000)}s`,
          retryable: true,
          backoffMs: rateLimitCheck.retryAfterMs,
        },
        latency: 0,
        cached: false,
      };
    }

    // Check for cached result (idempotent execution)
    const cached = this.getCachedResult(request.id);
    if (cached) {
      return { ...cached, cached: true };
    }

    // Execute with safety measures
    return await this.executeWithRetry(fullRequest, executor);
  }

  /**
   * Execute with automatic retry and backoff
   */
  private async executeWithRetry<T>(
    request: ExecutionRequest,
    executor: () => Promise<T>
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.pendingExecutions.add(request.id);

    try {
      // Update rate limit
      this.updateRateLimit(request.type, request.userId);

      // Execute
      const result = await executor();
      const latency = Date.now() - startTime;

      // Log successful execution
      logger.logTradeDecision({
        userId: request.userId,
        action: request.type as any,
        reasoning: `Executed ${request.type}`,
        confidence: 1.0,
        latency,
        success: true,
      });

      const executionResult: ExecutionResult = {
        success: true,
        data: result,
        latency,
        cached: false,
      };

      // Cache result for idempotency
      this.cacheResult(request.id, executionResult);

      return executionResult;

    } catch (error) {
      const latency = Date.now() - startTime;
      const classifiedError = this.classifyError(error);

      // Log failed execution
      logger.logTradeDecision({
        userId: request.userId,
        action: request.type as any,
        reasoning: `Failed ${request.type}: ${classifiedError.message}`,
        confidence: 0,
        latency,
        success: false,
        error: classifiedError.message,
      });

      // Retry if appropriate
      if (classifiedError.retryable && request.retryCount < 3) {
        logger.logAlert({
          level: "info",
          category: "execution_error",
          message: `Retrying ${request.type} (attempt ${request.retryCount + 1})`,
          metadata: { requestId: request.id, error: classifiedError.message },
        });

        // Wait for backoff period
        await this.sleep(classifiedError.backoffMs);

        // Retry
        return await this.executeWithRetry(
          { ...request, retryCount: request.retryCount + 1 },
          executor
        );
      }

      const executionResult: ExecutionResult = {
        success: false,
        error: classifiedError,
        latency,
        cached: false,
      };

      // Cache failed result to prevent duplicate attempts
      this.cacheResult(request.id, executionResult, 300000); // 5 minutes

      return executionResult;

    } finally {
      this.pendingExecutions.delete(request.id);
    }
  }

  /**
   * Classify errors for better handling
   */
  private classifyError(error: any): ClassifiedError {
    const message = error?.message || error?.toString() || "Unknown error";

    // Network errors
    if (message.includes("ECONNRESET") || message.includes("ETIMEDOUT") || message.includes("fetch failed")) {
      return {
        type: "network",
        message: "Network connection error",
        retryable: true,
        backoffMs: 2000,
      };
    }

    // Rate limiting
    if (message.includes("rate limit") || message.includes("429") || error?.status === 429) {
      return {
        type: "rate_limit",
        message: "API rate limit exceeded",
        retryable: true,
        backoffMs: 60000, // 1 minute
      };
    }

    // Insufficient balance
    if (message.includes("insufficient") || message.includes("balance") || message.includes("funds")) {
      return {
        type: "insufficient_balance",
        message: "Insufficient balance for trade",
        retryable: false,
        backoffMs: 0,
      };
    }

    // Market closed
    if (message.includes("market closed") || message.includes("trading halted") || message.includes("market not found")) {
      return {
        type: "market_closed",
        message: "Market is closed or unavailable",
        retryable: false,
        backoffMs: 0,
      };
    }

    // Invalid parameters
    if (message.includes("invalid") || message.includes("validation") || error?.status === 400) {
      return {
        type: "invalid_params",
        message: "Invalid request parameters",
        retryable: false,
        backoffMs: 0,
      };
    }

    // System errors (default)
    return {
      type: "system",
      message: message.substring(0, 200), // Truncate long messages
      retryable: true,
      backoffMs: 5000,
    };
  }

  /**
   * Check rate limits
   */
  private checkRateLimit(type: string, userId: string): { allowed: boolean; retryAfterMs: number } {
    const key = `${type}:${userId}`;
    const limit = this.RATE_LIMITS[type as keyof typeof this.RATE_LIMITS];
    
    if (!limit) {
      return { allowed: true, retryAfterMs: 0 };
    }

    const now = Date.now();
    let state = this.rateLimits.get(key);

    if (!state) {
      state = { requests: [], windowStart: now };
      this.rateLimits.set(key, state);
    }

    // Clean old requests outside window
    state.requests = state.requests.filter(timestamp => now - timestamp < limit.windowMs);

    if (state.requests.length >= limit.requests) {
      const oldestRequest = Math.min(...state.requests);
      const retryAfterMs = limit.windowMs - (now - oldestRequest);
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
    }

    return { allowed: true, retryAfterMs: 0 };
  }

  /**
   * Update rate limit state
   */
  private updateRateLimit(type: string, userId: string): void {
    const key = `${type}:${userId}`;
    const now = Date.now();
    
    let state = this.rateLimits.get(key);
    if (!state) {
      state = { requests: [], windowStart: now };
      this.rateLimits.set(key, state);
    }

    state.requests.push(now);
  }

  /**
   * Cache execution result for idempotency
   */
  private cacheResult(requestId: string, result: ExecutionResult, ttlMs: number = 3600000): void {
    this.executionHistory.set(requestId, result);

    // Clean cache after TTL
    setTimeout(() => {
      this.executionHistory.delete(requestId);
    }, ttlMs);
  }

  /**
   * Get cached result
   */
  private getCachedResult(requestId: string): ExecutionResult | null {
    return this.executionHistory.get(requestId) || null;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique request ID
   */
  static generateRequestId(type: string, params: Record<string, any>): string {
    const paramHash = JSON.stringify(params, Object.keys(params).sort());
    const hash = this.simpleHash(paramHash);
    return `${type}_${Date.now()}_${hash}`;
  }

  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    totalExecutions: number;
    successRate: number;
    avgLatency: number;
    rateLimitHits: number;
    retryCount: number;
  } {
    // This would be implemented with proper metrics collection
    return {
      totalExecutions: this.executionHistory.size,
      successRate: 0.95, // Placeholder
      avgLatency: 1500, // Placeholder
      rateLimitHits: 0, // Placeholder
      retryCount: 0, // Placeholder
    };
  }
}

interface RateLimitState {
  requests: number[];
  windowStart: number;
}

// Global execution safety manager
export const executionSafety = new ExecutionSafetyManager();
