// ============================================================
// ADVANCED SKILLS — Email, Calendar, Web, Files, AI Tools
// ============================================================

import { SkillRegistry } from "./skills.js";

export interface AdvancedSkillDeps {
  bankrPrompt?: (prompt: string) => Promise<{ success: boolean; response?: string; error?: string }>;
}

// ============================================================
// EMAIL MANAGEMENT
// ============================================================
export function registerEmailSkills(registry: SkillRegistry, deps: AdvancedSkillDeps) {
  const { bankrPrompt } = deps;
  if (!bankrPrompt) return;

  registry.register({
    name: "send_email",
    description: "Send email via Gmail API. Perfect for notifications, reports, or communication.",
    category: "utility",
    parameters: [
      { name: "to", type: "string", description: "Recipient email address", required: true },
      { name: "subject", type: "string", description: "Email subject line", required: true },
      { name: "body", type: "string", description: "Email body content", required: true },
      { name: "cc", type: "string", description: "CC recipients (comma-separated)", required: false },
    ],
    execute: async (params: any) => {
      let prompt = `Send email to ${params.to} with subject "${params.subject}" and body: ${params.body}`;
      if (params.cc) prompt += ` CC: ${params.cc}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "Email sent" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "read_emails",
    description: "Read recent emails from Gmail inbox",
    category: "utility",
    parameters: [
      { name: "limit", type: "number", description: "Number of emails to read (default 10)", required: false },
      { name: "unread_only", type: "boolean", description: "Only show unread emails", required: false },
      { name: "from", type: "string", description: "Filter by sender email", required: false },
    ],
    execute: async (params: any) => {
      const limit = params.limit || 10;
      let prompt = `Read ${limit} recent emails from Gmail`;
      if (params.unread_only) prompt += " (unread only)";
      if (params.from) prompt += ` from ${params.from}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "No emails found" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "email_trading_report",
    description: "Send automated trading performance report via email",
    category: "utility",
    parameters: [
      { name: "recipient", type: "string", description: "Email recipient", required: true },
      { name: "period", type: "string", description: "Report period (daily, weekly, monthly)", required: false },
    ],
    execute: async (params: any) => {
      const period = params.period || "daily";
      const result = await bankrPrompt(`Generate and send ${period} trading report to ${params.recipient} including P&L, win rate, top trades, and portfolio summary`);
      return result.success ? result.response || "Trading report sent" : `Failed: ${result.error}`;
    },
  });
}

// ============================================================
// CALENDAR & REMINDERS
// ============================================================
export function registerCalendarSkills(registry: SkillRegistry, deps: AdvancedSkillDeps) {
  const { bankrPrompt } = deps;
  if (!bankrPrompt) return;

  registry.register({
    name: "set_reminder",
    description: "Set calendar reminder or alert. Use natural language for time (e.g., 'in 2 hours', 'tomorrow at 9am', 'next Friday')",
    category: "utility",
    parameters: [
      { name: "message", type: "string", description: "Reminder message", required: true },
      { name: "when", type: "string", description: "When to remind (natural language)", required: true },
      { name: "recurring", type: "string", description: "Recurring pattern (daily, weekly, monthly)", required: false },
    ],
    execute: async (params: any) => {
      let prompt = `Set reminder "${params.message}" for ${params.when}`;
      if (params.recurring) prompt += ` recurring ${params.recurring}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "Reminder set" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "schedule_meeting",
    description: "Schedule meeting or event in calendar",
    category: "utility",
    parameters: [
      { name: "title", type: "string", description: "Meeting title", required: true },
      { name: "datetime", type: "string", description: "Date and time (natural language)", required: true },
      { name: "duration", type: "string", description: "Duration (e.g., '1 hour', '30 minutes')", required: false },
      { name: "attendees", type: "string", description: "Attendee emails (comma-separated)", required: false },
    ],
    execute: async (params: any) => {
      let prompt = `Schedule meeting "${params.title}" for ${params.datetime}`;
      if (params.duration) prompt += ` duration ${params.duration}`;
      if (params.attendees) prompt += ` with attendees: ${params.attendees}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "Meeting scheduled" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "check_calendar",
    description: "Check upcoming calendar events and schedule",
    category: "utility",
    parameters: [
      { name: "period", type: "string", description: "Time period to check (today, tomorrow, this week)", required: false },
    ],
    execute: async (params: any) => {
      const period = params.period || "today";
      const result = await bankrPrompt(`Show my calendar for ${period}`);
      return result.success ? result.response || "No events found" : `Failed: ${result.error}`;
    },
  });
}

// ============================================================
// WEB SCRAPING & RESEARCH
// ============================================================
export function registerWebSkills(registry: SkillRegistry, deps: AdvancedSkillDeps) {
  const { bankrPrompt } = deps;
  if (!bankrPrompt) return;

  registry.register({
    name: "web_search",
    description: "Search the web for information, news, or research",
    category: "research",
    parameters: [
      { name: "query", type: "string", description: "Search query", required: true },
      { name: "limit", type: "number", description: "Number of results (default 5)", required: false },
      { name: "site", type: "string", description: "Specific site to search (e.g., reddit.com)", required: false },
    ],
    execute: async (params: any) => {
      const limit = params.limit || 5;
      let prompt = `Search web for "${params.query}" and return top ${limit} results with summaries`;
      if (params.site) prompt += ` from site:${params.site}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "No results found" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "scrape_website",
    description: "Extract specific information from a website",
    category: "research",
    parameters: [
      { name: "url", type: "string", description: "Website URL to scrape", required: true },
      { name: "data_type", type: "string", description: "What to extract (prices, news, text, etc.)", required: true },
    ],
    execute: async (params: any) => {
      const result = await bankrPrompt(`Scrape ${params.url} and extract ${params.data_type}`);
      return result.success ? result.response || "No data extracted" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "monitor_news",
    description: "Monitor news for specific keywords or topics",
    category: "research",
    parameters: [
      { name: "keywords", type: "string", description: "Keywords to monitor (comma-separated)", required: true },
      { name: "sources", type: "string", description: "News sources to monitor", required: false },
    ],
    execute: async (params: any) => {
      let prompt = `Monitor news for keywords: ${params.keywords}`;
      if (params.sources) prompt += ` from sources: ${params.sources}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "No news found" : `Failed: ${result.error}`;
    },
  });
}

// ============================================================
// FILE MANAGEMENT
// ============================================================
export function registerFileSkills(registry: SkillRegistry, deps: AdvancedSkillDeps) {
  const { bankrPrompt } = deps;
  if (!bankrPrompt) return;

  registry.register({
    name: "save_to_drive",
    description: "Save content to Google Drive or cloud storage",
    category: "utility",
    parameters: [
      { name: "filename", type: "string", description: "File name", required: true },
      { name: "content", type: "string", description: "Content to save", required: true },
      { name: "folder", type: "string", description: "Folder path (optional)", required: false },
    ],
    execute: async (params: any) => {
      let prompt = `Save content to Google Drive as "${params.filename}": ${params.content}`;
      if (params.folder) prompt += ` in folder ${params.folder}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "File saved" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "read_from_drive",
    description: "Read file from Google Drive",
    category: "utility",
    parameters: [
      { name: "filename", type: "string", description: "File name to read", required: true },
      { name: "folder", type: "string", description: "Folder path (optional)", required: false },
    ],
    execute: async (params: any) => {
      let prompt = `Read file "${params.filename}" from Google Drive`;
      if (params.folder) prompt += ` in folder ${params.folder}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "File not found" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "organize_files",
    description: "Organize and manage files in cloud storage",
    category: "utility",
    parameters: [
      { name: "action", type: "string", description: "Action: organize, backup, cleanup, or sync", required: true },
      { name: "folder", type: "string", description: "Target folder", required: false },
    ],
    execute: async (params: any) => {
      let prompt = `${params.action} files`;
      if (params.folder) prompt += ` in folder ${params.folder}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "Files organized" : `Failed: ${result.error}`;
    },
  });
}

// ============================================================
// AI-POWERED ANALYSIS
// ============================================================
export function registerAISkills(registry: SkillRegistry, deps: AdvancedSkillDeps) {
  const { bankrPrompt } = deps;
  if (!bankrPrompt) return;

  registry.register({
    name: "analyze_document",
    description: "Analyze documents, PDFs, or text for key insights",
    category: "research",
    parameters: [
      { name: "document", type: "string", description: "Document content or URL", required: true },
      { name: "analysis_type", type: "string", description: "Type of analysis (summary, sentiment, key points, etc.)", required: true },
    ],
    execute: async (params: any) => {
      const result = await bankrPrompt(`Analyze document for ${params.analysis_type}: ${params.document}`);
      return result.success ? result.response || "Analysis complete" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "generate_report",
    description: "Generate comprehensive reports on any topic",
    category: "utility",
    parameters: [
      { name: "topic", type: "string", description: "Report topic", required: true },
      { name: "format", type: "string", description: "Report format (executive summary, detailed, bullet points)", required: false },
      { name: "data_sources", type: "string", description: "Data sources to include", required: false },
    ],
    execute: async (params: any) => {
      const format = params.format || "detailed";
      let prompt = `Generate ${format} report on "${params.topic}"`;
      if (params.data_sources) prompt += ` using data from: ${params.data_sources}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "Report generated" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "smart_summary",
    description: "Create intelligent summaries of complex information",
    category: "utility",
    parameters: [
      { name: "content", type: "string", description: "Content to summarize", required: true },
      { name: "length", type: "string", description: "Summary length (brief, medium, detailed)", required: false },
      { name: "focus", type: "string", description: "What to focus on in summary", required: false },
    ],
    execute: async (params: any) => {
      const length = params.length || "medium";
      let prompt = `Create ${length} summary of: ${params.content}`;
      if (params.focus) prompt += ` focusing on: ${params.focus}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "Summary created" : `Failed: ${result.error}`;
    },
  });
}

// ============================================================
// AUTOMATION & WORKFLOWS
// ============================================================
export function registerWorkflowSkills(registry: SkillRegistry, deps: AdvancedSkillDeps) {
  const { bankrPrompt } = deps;
  if (!bankrPrompt) return;

  registry.register({
    name: "create_workflow",
    description: "Create automated workflow or task sequence",
    category: "automation",
    parameters: [
      { name: "name", type: "string", description: "Workflow name", required: true },
      { name: "steps", type: "string", description: "Workflow steps (comma-separated)", required: true },
      { name: "trigger", type: "string", description: "When to trigger (time, event, condition)", required: true },
    ],
    execute: async (params: any) => {
      const result = await bankrPrompt(`Create workflow "${params.name}" with steps: ${params.steps}, triggered by: ${params.trigger}`);
      return result.success ? result.response || "Workflow created" : `Failed: ${result.error}`;
    },
  });

  registry.register({
    name: "execute_workflow",
    description: "Execute a predefined workflow",
    category: "automation",
    parameters: [
      { name: "workflow_name", type: "string", description: "Name of workflow to execute", required: true },
      { name: "parameters", type: "string", description: "Workflow parameters (optional)", required: false },
    ],
    execute: async (params: any) => {
      let prompt = `Execute workflow "${params.workflow_name}"`;
      if (params.parameters) prompt += ` with parameters: ${params.parameters}`;
      const result = await bankrPrompt(prompt);
      return result.success ? result.response || "Workflow executed" : `Failed: ${result.error}`;
    },
  });
}

// ============================================================
// MASTER REGISTRATION FUNCTION
// ============================================================
export function registerAllAdvancedSkills(registry: SkillRegistry, deps: AdvancedSkillDeps) {
  console.log("🚀 Registering advanced skills...");
  
  registerEmailSkills(registry, deps);
  registerCalendarSkills(registry, deps);
  registerWebSkills(registry, deps);
  registerFileSkills(registry, deps);
  registerAISkills(registry, deps);
  registerWorkflowSkills(registry, deps);
  
  console.log("✅ Advanced skills registered");
}
