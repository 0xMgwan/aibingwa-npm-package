// ============================================================
// INTELLIGENT CREDENTIAL PARSER — Claude-style natural language understanding
// ============================================================

export interface ParsedCredentials {
  email?: string;
  password?: string;
  appPassword?: string;
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  token?: string;
  [key: string]: any;
}

export class IntelligentCredentialParser {
  
  // Main parsing function - tries to understand any credential format
  static parseCredentials(input: string, serviceHint?: string): ParsedCredentials | null {
    const cleanInput = input.trim();
    
    // Try different parsing strategies
    const strategies = [
      this.parseEmailPassword,
      this.parseApiKey,
      this.parseStructuredFormat,
      this.parseNaturalLanguage,
      this.parseFreeform,
    ];
    
    for (const strategy of strategies) {
      const result = strategy(cleanInput);
      if (result && this.validateCredentials(result, serviceHint)) {
        return result;
      }
    }
    
    return null;
  }
  
  // Parse email and password combinations
  private static parseEmailPassword(input: string): ParsedCredentials | null {
    // Extract email
    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
    const emailMatch = input.match(emailPattern);
    
    if (!emailMatch) return null;
    
    const email = emailMatch[1];
    
    // Extract password - very flexible patterns
    const passwordPatterns = [
      // After email with various separators
      new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[:\\s,;]+([^\\s,;]{6,})', 'i'),
      
      // Common password keywords
      /(?:password|pass|pwd)[:\s=]+([^\s,;]{6,})/i,
      /(?:app[_\s]?password)[:\s=]+([^\s,;]{6,})/i,
      
      // Just any string after email that looks like a password
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\w]*([a-zA-Z0-9!@#$%^&*()_+\-=\[\]{}|;':\",./<>?]{6,})/,
      
      // Any alphanumeric string 8+ chars (common app password length)
      /([a-zA-Z0-9]{8,})/,
    ];
    
    for (const pattern of passwordPatterns) {
      const match = input.match(pattern);
      if (match && match[1] && match[1] !== email && !match[1].includes('@')) {
        return {
          email: email,
          password: match[1],
          appPassword: match[1], // Assume it's an app password for Gmail
        };
      }
    }
    
    return null;
  }
  
  // Parse API keys
  private static parseApiKey(input: string): ParsedCredentials | null {
    const apiKeyPatterns = [
      // Google API keys
      /AIza[0-9A-Za-z_-]{35}/,
      
      // Generic API key patterns
      /(?:api[_\s]?key|key)[:\s=]+([a-zA-Z0-9_-]{8,})/i,
      /(?:token)[:\s=]+([a-zA-Z0-9_-]{8,})/i,
      
      // Long alphanumeric strings that could be API keys
      /([a-zA-Z0-9_-]{20,})/,
    ];
    
    for (const pattern of apiKeyPatterns) {
      const match = input.match(pattern);
      if (match) {
        return {
          apiKey: match[1] || match[0],
        };
      }
    }
    
    return null;
  }
  
  // Parse structured formats like JSON or key:value pairs
  private static parseStructuredFormat(input: string): ParsedCredentials | null {
    try {
      // Try JSON parsing
      const parsed = JSON.parse(input);
      if (typeof parsed === 'object') {
        return parsed;
      }
    } catch (e) {
      // Not JSON, continue
    }
    
    // Parse key:value pairs
    const result: ParsedCredentials = {};
    const pairs = input.split(/[,;\n]/);
    
    for (const pair of pairs) {
      const match = pair.match(/([^:=]+)[:\s=]+(.+)/);
      if (match) {
        const key = match[1].trim().toLowerCase();
        const value = match[2].trim();
        
        // Map common key names
        if (key.includes('email')) result.email = value;
        else if (key.includes('password') || key.includes('pass')) result.password = value;
        else if (key.includes('api') && key.includes('key')) result.apiKey = value;
        else if (key.includes('client') && key.includes('id')) result.clientId = value;
        else if (key.includes('client') && key.includes('secret')) result.clientSecret = value;
        else if (key.includes('token')) result.token = value;
        else result[key] = value;
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  }
  
  // Parse natural language descriptions
  private static parseNaturalLanguage(input: string): ParsedCredentials | null {
    const result: ParsedCredentials = {};
    
    // Look for natural language patterns
    const patterns = [
      { pattern: /my email is ([^\s,;]+@[^\s,;]+)/i, key: 'email' },
      { pattern: /email[:\s]+([^\s,;]+@[^\s,;]+)/i, key: 'email' },
      { pattern: /my password is ([^\s,;]+)/i, key: 'password' },
      { pattern: /password[:\s]+([^\s,;]+)/i, key: 'password' },
      { pattern: /my api key is ([^\s,;]+)/i, key: 'apiKey' },
      { pattern: /api key[:\s]+([^\s,;]+)/i, key: 'apiKey' },
    ];
    
    for (const { pattern, key } of patterns) {
      const match = input.match(pattern);
      if (match) {
        result[key] = match[1];
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  }
  
  // Parse freeform text - extract anything that looks like credentials
  private static parseFreeform(input: string): ParsedCredentials | null {
    const result: ParsedCredentials = {};
    
    // Extract email if present
    const emailMatch = input.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      result.email = emailMatch[1];
    }
    
    // Extract anything that looks like a password/token/key
    const tokens = input.split(/\s+/);
    for (const token of tokens) {
      // Skip emails and common words
      if (token.includes('@') || token.length < 6) continue;
      if (['password', 'email', 'gmail', 'google', 'api', 'key'].includes(token.toLowerCase())) continue;
      
      // If it's alphanumeric and reasonably long, it might be a credential
      if (/^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{}|;':\",./<>?]{6,}$/.test(token)) {
        if (!result.password && !result.apiKey) {
          // Decide if it's more likely a password or API key based on length and format
          if (token.length >= 16 || /^[A-Z][a-zA-Z0-9_-]+/.test(token)) {
            result.apiKey = token;
          } else {
            result.password = token;
            result.appPassword = token;
          }
        }
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  }
  
  // Validate that the parsed credentials make sense for the service
  private static validateCredentials(creds: ParsedCredentials, serviceHint?: string): boolean {
    if (!serviceHint) return true;
    
    const service = serviceHint.toLowerCase();
    
    if (service.includes('gmail') || service.includes('email')) {
      return !!(creds.email && (creds.password || creds.appPassword));
    }
    
    if (service.includes('calendar') || service.includes('weather')) {
      return !!(creds.apiKey);
    }
    
    // For unknown services, accept any credentials
    return true;
  }
  
  // Get a human-readable summary of what was parsed
  static getSummary(creds: ParsedCredentials): string {
    const parts = [];
    
    if (creds.email) parts.push(`Email: ${creds.email}`);
    if (creds.password || creds.appPassword) parts.push(`Password: ${'*'.repeat(8)}`);
    if (creds.apiKey) parts.push(`API Key: ${creds.apiKey.substring(0, 8)}...`);
    if (creds.clientId) parts.push(`Client ID: ${creds.clientId.substring(0, 8)}...`);
    if (creds.token) parts.push(`Token: ${creds.token.substring(0, 8)}...`);
    
    return parts.join(', ') || 'Credentials detected';
  }
}
