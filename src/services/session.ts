import type { ConversationSession } from "../types/index.js";
import { config } from "../config.js";

const sessions = new Map<string, ConversationSession>();

export function getOrCreateSession(phoneNumber: string): ConversationSession {
  const existing = sessions.get(phoneNumber);
  if (existing) {
    existing.lastActivity = Date.now();
    return existing;
  }

  const session: ConversationSession = {
    phoneNumber,
    messages: [],
    leadProfile: { budgetAcknowledged: false },
    escalated: false,
    lastActivity: Date.now(),
  };
  sessions.set(phoneNumber, session);
  return session;
}

export function saveSession(session: ConversationSession): void {
  session.lastActivity = Date.now();
  sessions.set(session.phoneNumber, session);
}

export function evictExpiredSessions(): void {
  const cutoff = Date.now() - config.sessionTtlSeconds * 1000;
  for (const [key, session] of sessions.entries()) {
    if (session.lastActivity < cutoff) {
      sessions.delete(key);
    }
  }
}

// Run eviction every 10 minutes
setInterval(evictExpiredSessions, 10 * 60 * 1000);
