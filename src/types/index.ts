import type Anthropic from "@anthropic-ai/sdk";

export interface ConversationSession {
  phoneNumber: string;
  messages: Anthropic.MessageParam[];
  leadProfile: LeadProfile;
  escalated: boolean;
  lastActivity: number;
}

export interface LeadProfile {
  desiredDate?: string;
  eventType?: string;
  guestCount?: number;
  budgetAcknowledged: boolean;
}

export interface AvailabilitySlot {
  date: string;
  available: boolean;
}

export interface WhatsAppTextMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text";
  text: { body: string };
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        messages?: WhatsAppTextMessage[];
        statuses?: unknown[];
      };
      field: string;
    }>;
  }>;
}

export interface EscalateToHumanArgs {
  lead_profile: {
    desired_date: string;
    event_type: string;
    guest_count: number;
    summary: string;
  };
}

export interface CheckCalendarArgs {
  start_date: string;
  end_date: string;
}
