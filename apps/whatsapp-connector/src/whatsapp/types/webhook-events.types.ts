/**
 * Types for WhatsApp webhook events
 */

export interface ConnectionData {
  phoneNumber: string;
  profile?: unknown;
  id: string;
  hasProfile?: boolean;
}

export interface BaseWebhookPayload<T = unknown> {
  event: string;
  timestamp: string;
  data: T;
}

// Specific event payloads
export type QREventPayload = BaseWebhookPayload<[string]>;
export type PairingSuccessPayload = BaseWebhookPayload<ConnectionData>;
export type MessageEventPayload = BaseWebhookPayload<unknown[]>;
export type MessageAckPayload = BaseWebhookPayload<unknown[]>;
export type MessageReactionPayload = BaseWebhookPayload<unknown[]>;
export type ContactChangedPayload = BaseWebhookPayload<unknown[]>;
export type AuthFailurePayload = BaseWebhookPayload<unknown[]>;
export type DisconnectedPayload = BaseWebhookPayload<unknown[]>;
export type ChangeStatePayload = BaseWebhookPayload<unknown[]>;
export type MessageCreatePayload = BaseWebhookPayload<unknown[]>;
export type MessageEditPayload = BaseWebhookPayload<unknown[]>;
export type MessageRevokePayload = BaseWebhookPayload<unknown[]>;
export type MediaUploadedPayload = BaseWebhookPayload<unknown[]>;
export type GroupJoinPayload = BaseWebhookPayload<unknown[]>;
export type GroupLeavePayload = BaseWebhookPayload<unknown[]>;
export type GroupUpdatePayload = BaseWebhookPayload<unknown[]>;
export type GroupAdminChangedPayload = BaseWebhookPayload<unknown[]>;
export type GroupMembershipRequestPayload = BaseWebhookPayload<unknown[]>;
export type ChatArchivedPayload = BaseWebhookPayload<unknown[]>;
export type ChatRemovedPayload = BaseWebhookPayload<unknown[]>;
export type IncomingCallPayload = BaseWebhookPayload<unknown[]>;
export type VoteUpdatePayload = BaseWebhookPayload<unknown[]>;

// Union type for all webhook payloads
export type WebhookPayload =
  | QREventPayload
  | PairingSuccessPayload
  | MessageEventPayload
  | MessageAckPayload
  | MessageReactionPayload
  | ContactChangedPayload
  | AuthFailurePayload
  | DisconnectedPayload
  | ChangeStatePayload
  | MessageCreatePayload
  | MessageEditPayload
  | MessageRevokePayload
  | MediaUploadedPayload
  | GroupJoinPayload
  | GroupLeavePayload
  | GroupUpdatePayload
  | GroupAdminChangedPayload
  | GroupMembershipRequestPayload
  | ChatArchivedPayload
  | ChatRemovedPayload
  | IncomingCallPayload
  | VoteUpdatePayload;

// Event names enum for type safety
export enum WebhookEventName {
  QR = 'qr',
  PAIRING_SUCCESS = 'pairing_success',
  AUTH_FAILURE = 'auth_failure',
  DISCONNECTED = 'disconnected',
  CHANGE_STATE = 'change_state',
  MESSAGE = 'message',
  MESSAGE_CREATE = 'message_create',
  MESSAGE_ACK = 'message_ack',
  MESSAGE_EDIT = 'message_edit',
  MESSAGE_REVOKE_ME = 'message_revoke_me',
  MESSAGE_REVOKE_EVERYONE = 'message_revoke_everyone',
  MESSAGE_REACTION = 'message_reaction',
  MEDIA_UPLOADED = 'media_uploaded',
  GROUP_JOIN = 'group_join',
  GROUP_LEAVE = 'group_leave',
  GROUP_UPDATE = 'group_update',
  GROUP_ADMIN_CHANGED = 'group_admin_changed',
  GROUP_MEMBERSHIP_REQUEST = 'group_membership_request',
  CHAT_ARCHIVED = 'chat_archived',
  CHAT_REMOVED = 'chat_removed',
  CONTACT_CHANGED = 'contact_changed',
  INCOMING_CALL = 'incoming_call',
  VOTE_UPDATE = 'vote_update',
}
