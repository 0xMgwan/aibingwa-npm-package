// ============================================================
// REAL GMAIL API INTEGRATION — Actual email sending/receiving
// ============================================================

import { google } from 'googleapis';
import nodemailer from 'nodemailer';

export interface GmailCredentials {
  email: string;
  appPassword: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

export class RealGmailAPI {
  private credentials: GmailCredentials;
  private transporter: any;

  constructor(credentials: GmailCredentials) {
    this.credentials = credentials;
    this.setupTransporter();
  }

  private setupTransporter() {
    // Use Gmail SMTP with app password for reliable sending
    this.transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: this.credentials.email,
        pass: this.credentials.appPassword,
      },
    });
  }

  // Actually send email via Gmail SMTP
  async sendEmail(to: string, subject: string, body: string, html?: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const mailOptions = {
        from: this.credentials.email,
        to: to,
        subject: subject,
        text: body,
        html: html || body,
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to send email: ${error}`,
      };
    }
  }

  // Actually check Gmail inbox via IMAP
  async checkInbox(unreadOnly: boolean = true, limit: number = 10): Promise<{ success: boolean; emails?: any[]; error?: string }> {
    try {
      // Use Gmail API if we have OAuth credentials, otherwise use IMAP
      if (this.credentials.clientId && this.credentials.refreshToken) {
        return await this.checkInboxViaAPI(unreadOnly, limit);
      } else {
        return await this.checkInboxViaIMAP(unreadOnly, limit);
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to check inbox: ${error}`,
      };
    }
  }

  private async checkInboxViaAPI(unreadOnly: boolean, limit: number): Promise<{ success: boolean; emails?: any[]; error?: string }> {
    try {
      const oauth2Client = new google.auth.OAuth2(
        this.credentials.clientId,
        this.credentials.clientSecret
      );
      
      oauth2Client.setCredentials({
        refresh_token: this.credentials.refreshToken,
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      const query = unreadOnly ? 'is:unread' : '';
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: limit,
      });

      const messages = response.data.messages || [];
      const emails = [];

      for (const message of messages.slice(0, limit)) {
        const email = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
        });

        const headers = email.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
        const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
        const date = headers.find(h => h.name === 'Date')?.value || 'Unknown Date';

        emails.push({
          id: message.id,
          subject,
          from,
          date,
          snippet: email.data.snippet,
        });
      }

      return {
        success: true,
        emails,
      };
    } catch (error) {
      return {
        success: false,
        error: `Gmail API error: ${error}`,
      };
    }
  }

  private async checkInboxViaIMAP(unreadOnly: boolean, limit: number): Promise<{ success: boolean; emails?: any[]; error?: string }> {
    // For now, return a helpful message about IMAP setup
    return {
      success: false,
      error: 'IMAP checking requires additional setup. Please provide OAuth2 credentials for full Gmail API access.',
    };
  }

  // Test connection
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.transporter.verify();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Connection failed: ${error}`,
      };
    }
  }
}
