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
    // Use Gmail SMTP with explicit configuration for better reliability
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: this.credentials.email,
        pass: this.credentials.appPassword,
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  // Actually send email via Gmail SMTP
  async sendEmail(to: string, subject: string, body: string, html?: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      console.log(`📧 Attempting to send email from ${this.credentials.email} to ${to}`);
      
      const mailOptions = {
        from: this.credentials.email,
        to: to,
        subject: subject,
        text: body,
        html: html || body,
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      console.log(`✅ Email sent successfully: ${result.messageId}`);
      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error: any) {
      console.error(`❌ Gmail SMTP Error:`, error);
      
      let errorMessage = `Gmail SMTP failed: ${error.message || error}`;
      
      // Provide specific guidance based on error type
      if (error.code === 'EAUTH' || error.responseCode === 535) {
        errorMessage += `\n\n🔑 Authentication failed. Please:\n1. Enable 2FA on Gmail\n2. Generate App Password at myaccount.google.com/apppasswords\n3. Use the 16-character app password (not your regular password)`;
      } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
        errorMessage += `\n\n🌐 Connection failed. Check your internet connection.`;
      } else if (error.code === 'EMESSAGE') {
        errorMessage += `\n\n📝 Message format issue. Check recipient email format.`;
      }
      
      return {
        success: false,
        error: errorMessage,
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
