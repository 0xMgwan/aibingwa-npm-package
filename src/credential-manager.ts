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

// Helper functions for credential parsing
export function parseGmailCredentials(input: string): any {
  // Parse various Gmail credential formats
  const patterns = [
    /email:\s*([^\s,]+).*?password:\s*([^\s,]+)/i,
    /gmail:\s*([^\s,]+).*?pass:\s*([^\s,]+)/i,
    /([^\s@]+@[^\s,]+).*?([a-zA-Z0-9]{16})/,  // email and app password
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return {
        email: match[1],
        appPassword: match[2],
      };
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
