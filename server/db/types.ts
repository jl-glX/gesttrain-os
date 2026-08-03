import type { Generated } from "kysely";

interface User {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  lastName: Generated<string>;
  countryCode: Generated<string>;
  locale: Generated<string>;
  accountStatus: Generated<
    "pending_verification" | "active" | "security_review"
  >;
  emailVerifiedAt: Generated<number | null>;
  termsVersion: Generated<string>;
  termsAcceptedAt: Generated<number | null>;
  privacyVersion: Generated<string>;
  privacyAcceptedAt: Generated<number | null>;
  avatarDataUrl: string;
  password: string;
  role: "member" | "trainer" | "admin";
  sessionIdleTimeoutMinutes: number;
  createdAt: number;
}

interface AccountSupportIdentifier {
  id: string;
  userId: string;
  publicId: string;
  status: "active" | "revoked";
  rotationReason:
    | "account_recovery"
    | "security_incident"
    | "administrative_correction"
    | null;
  createdAt: number;
  revokedAt: number | null;
}

interface EmailVerificationChallenge {
  id: string;
  userId: string;
  codeHash: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  consumedAt: number | null;
}

interface AccountDeletionPreference {
  userId: string;
  inactivityMonths: number | null;
  lastMeaningfulActivityAt: number;
  updatedAt: number;
}

interface AccountDeletionRequest {
  id: string;
  userId: string;
  trigger: "manual" | "inactivity";
  status: "scheduled" | "cancelled" | "processing" | "completed";
  requestedAt: number;
  graceEndsAt: number;
  cancelledAt: number | null;
  completedAt: number | null;
}

interface AccountDeletionJob {
  id: string;
  requestId: string;
  userId: string;
  status: "planned" | "blocked_retention_review" | "cancelled" | "completed";
  executionEnabled: 0 | 1;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

interface AccountDataDeletionDraft {
  userId: string;
  selectedCategories: string;
  intent: "selected_data" | "account_closure";
  updatedAt: number;
}

interface AccountRepresentative {
  id: string;
  ownerUserId: string;
  representativeUserId: string;
  scopes: string;
  reason:
    | "hospitalization"
    | "temporary_incapacity"
    | "permanent_incapacity"
    | "death_contingency"
    | "other";
  status: "draft" | "pending_review" | "approved" | "revoked" | "expired";
  startsAt: number;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
  revokedAt: number | null;
}

interface DataRetentionPolicy {
  id: string;
  name: string;
  jurisdiction: string;
  dataCategory: string;
  retentionDays: number | null;
  legalBasisReference: string;
  status: "draft" | "active" | "retired";
  version: number;
  reviewedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface DataRetentionRecord {
  id: string;
  userId: string | null;
  policyId: string;
  sourceType: string;
  sourceId: string;
  status: "retained" | "legal_hold" | "scheduled_deletion" | "released";
  retainUntil: number | null;
  createdAt: number;
  updatedAt: number;
  releasedAt: number | null;
}

interface GymClass {
  id: string;
  name: string;
  description: string;
  trainerId: string;
  trainerName: string;
  maxCapacity: number;
  scheduledAt: number;
}

interface Booking {
  id: string;
  classId: string;
  userId: string;
  status: "confirmed" | "cancelled" | "waitlist";
  createdAt: number;
  cancelledAt: number | null;
}

interface WaitlistEntry {
  id: string;
  classId: string;
  userId: string;
  position: number;
  createdAt: number;
  promotedAt: number | null;
}

interface Session {
  id: string;
  userId: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
  userAgent: string;
  remembered: number;
  formVerifiedAt: number;
}

interface MfaCredential {
  userId: string;
  secretEncrypted: string;
  recoveryCodeHashes: string;
  createdAt: number;
  updatedAt: number;
  enabledAt: number | null;
}

interface AuthChallenge {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  consumedAt: number | null;
  rememberDevice: number;
}

interface PasskeyCredential {
  id: string;
  userId: string;
  publicKey: string;
  counter: number;
  transports: string;
  deviceType: string;
  backedUp: number;
  createdAt: number;
}

interface WebauthnChallenge {
  id: string;
  userId: string;
  challenge: string;
  type: "registration" | "authentication";
  rememberDevice: number;
  createdAt: number;
  expiresAt: number;
  consumedAt: number | null;
}

interface SecurityEvent {
  id: string;
  userId: string | null;
  type: string;
  createdAt: number;
  metadata: string;
}

interface Feedback {
  id: string;
  userId: string | null;
  category: "suggestion" | "problem" | "accessibility" | "other";
  message: string;
  status: "new" | "reviewed" | "closed";
  createdAt: number;
}

interface BillingRecord {
  id: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  concept: string;
  billingCycle:
    "monthly" | "quarterly" | "semiannual" | "annual" | "trial_day" | "custom";
  customCycleLabel: string;
  amountCents: number;
  currency: string;
  status: "paid" | "unpaid" | "pending";
  dueAt: number | null;
  paidAt: number | null;
  invoiceNumber: string | null;
  notes: string;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface FacilityProfile {
  id: string;
  name: string;
  logoDataUrl: string;
  accentColor: string;
  updatedAt: number;
}

export type CommercialFacilityType =
  | "traditional_gym"
  | "crossfit"
  | "hyrox"
  | "functional_training"
  | "personal_training"
  | "powerlifting"
  | "strongman"
  | "bodybuilding"
  | "martial_arts"
  | "yoga"
  | "pilates"
  | "indoor_cycling"
  | "multidisciplinary"
  | "custom";

export type CommercialTrialStatus =
  | "trial_active"
  | "trial_paused_support"
  | "trial_conversion_review"
  | "trial_expired"
  | "trial_closed";

export type RealDataDeclaration = "undeclared" | "yes" | "no" | "assistance";

interface CommercialTrial {
  id: string;
  ownerUserId: string;
  facilityName: string;
  facilityType: CommercialFacilityType;
  approximateMembers: number | null;
  trainerCount: number | null;
  spaceCount: number | null;
  usualCapacity: number | null;
  classTypes: string;
  scheduleNotes: string;
  locale: "es" | "en" | "de" | "de-CH";
  currency: string;
  usesBookings: number;
  usesWaitlist: number;
  templateKey: string;
  status: CommercialTrialStatus;
  subdomain: string;
  realDataDeclaration: RealDataDeclaration;
  conversionDraft: string;
  startedAt: number;
  expiresAt: number;
  pausedAt: number | null;
  closedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface CommercialTrialEvent {
  id: string;
  trialId: string;
  actorUserId: string;
  type: string;
  metadata: string;
  createdAt: number;
}

interface DelegationGrant {
  id: string;
  ownerUserId: string;
  delegateUserId: string | null;
  tokenHash: string;
  tokenPreview: string;
  scope: "bookings";
  duration: "24h" | "7d" | "30d" | "indefinite";
  expiresAt: number | null;
  createdAt: number;
  redeemedAt: number | null;
  revokedAt: number | null;
  ownerHiddenAt: number | null;
  delegateHiddenAt: number | null;
}

export interface Database {
  users: User;
  accountSupportIdentifiers: AccountSupportIdentifier;
  emailVerificationChallenges: EmailVerificationChallenge;
  accountDeletionPreferences: AccountDeletionPreference;
  accountDeletionRequests: AccountDeletionRequest;
  accountDeletionJobs: AccountDeletionJob;
  accountDataDeletionDrafts: AccountDataDeletionDraft;
  accountRepresentatives: AccountRepresentative;
  dataRetentionPolicies: DataRetentionPolicy;
  dataRetentionRecords: DataRetentionRecord;
  gymClasses: GymClass;
  bookings: Booking;
  waitlistEntries: WaitlistEntry;
  sessions: Session;
  mfaCredentials: MfaCredential;
  authChallenges: AuthChallenge;
  passkeyCredentials: PasskeyCredential;
  webauthnChallenges: WebauthnChallenge;
  securityEvents: SecurityEvent;
  feedback: Feedback;
  billingRecords: BillingRecord;
  facilityProfiles: FacilityProfile;
  commercialTrials: CommercialTrial;
  commercialTrialEvents: CommercialTrialEvent;
  delegationGrants: DelegationGrant;
}
