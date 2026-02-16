// ============================================================
// DYNAMIC CREDENTIAL MANAGER — Accept credentials via chat
// ============================================================

interface UserCredentials {
  gmail?: {
    email: string;
    appPassword: string;
    clientId?: string;
    clientSecret?: string;
  };
  googleCalendar?: {
    apiKey: string;
    clientId?: string;
    clientSecret?: string;
  };
  weather?: {
    apiKey?: string;
  };
  news?: {
    apiKey?: string;
  };
  [service: string]: any;
}

// In-memory credential storage per user session
const userCredentials: Map<string, UserCredentials> = new Map();

export class CredentialManager {
  // Store credentials for a user
  static setCredentials(userId: string, service: string, credentials: any): void {
    if (!userCredentials.has(userId)) {
      userCredentials.set(userId, {});
    }
    
    const userCreds = userCredentials.get(userId)!;
    userCreds[service] = credentials;
    
    console.log(`🔐 Stored ${service} credentials for user ${userId}`);
  }

  // Get credentials for a user and service
  static getCredentials(userId: string, service: string): any {
    const userCreds = userCredentials.get(userId);
    return userCreds?.[service];
  }

  // Check if user has credentials for a service
  static hasCredentials(userId: string, service: string): boolean {
    const userCreds = userCredentials.get(userId);
    return !!(userCreds?.[service]);
  }

  // Clear credentials for a user
  static clearCredentials(userId: string, service?: string): void {
    if (service) {
      const userCreds = userCredentials.get(userId);
      if (userCreds) {
        delete userCreds[service];
      }
    } else {
      userCredentials.delete(userId);
    }
  }

  // List services with stored credentials
  static listServices(userId: string): string[] {
    const userCreds = userCredentials.get(userId);
    return userCreds ? Object.keys(userCreds) : [];
  }
}

// Helper functions for credential parsing - Claude-style intelligence
export function parseGmailCredentials(input: string): any {
  // Extract email addresses
  const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const emails = input.match(emailPattern);
  
  if (!emails || emails.length === 0) return null;
  
  const email = emails[0]; // Use first email found
  
  // Extract passwords/app passwords - much more flexible patterns
  const passwordPatterns = [
    // Explicit password mentions
    /password[:\s]+([a-zA-Z0-9]{8,})/i,
    /pass[:\s]+([a-zA-Z0-9]{8,})/i,
    /app[_\s]?password[:\s]+([a-zA-Z0-9]{8,})/i,
    
    // After email, look for password-like strings
    new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[:\\s,]+([a-zA-Z0-9]{8,})', 'i'),
    
    // Common formats: email:password, email password, email,password
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[:\s,]+([a-zA-Z0-9]{8,})/,
    
    // Just look for any 16+ character alphanumeric string (typical app password length)
    /([a-zA-Z0-9]{16,})/,
    
    // Look for any 8+ character string that could be a password
    /([a-zA-Z0-9]{8,})/,
  ];

  for (const pattern of passwordPatterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      // Validate it's not the email itself
      if (match[1] !== email && !match[1].includes('@')) {
        return {
          email: email,
          appPassword: match[1],
        };
      }
    }
  }

  return null;
}

export function parseCalendarCredentials(input: string): any {
  // Parse Google Calendar API key
  const apiKeyMatch = input.match(/(?:api[_\s]?key|calendar[_\s]?key):\s*([a-zA-Z0-9_-]+)/i);
  if (apiKeyMatch) {
    return {
      apiKey: apiKeyMatch[1],
    };
  }

  return null;
}

export function parseWeatherCredentials(input: string): any {
  // Parse weather API key
  const apiKeyMatch = input.match(/(?:weather[_\s]?key|openweather):\s*([a-zA-Z0-9_-]+)/i);
  if (apiKeyMatch) {
    return {
      apiKey: apiKeyMatch[1],
    };
  }

  return null;
}
