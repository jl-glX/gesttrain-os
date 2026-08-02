export const ACCOUNT_REPRESENTATION_SCOPES = [
  "cancel_bookings",
  "stop_subscriptions",
  "download_authorized_documents",
  "manage_pending_payments",
  "contact_support",
  "request_account_closure",
] as const;

export function getAccountContinuityBridge() {
  return {
    status: "planned" as const,
    executionEnabled: false as const,
    identityTransferAllowed: false as const,
    scopes: ACCOUNT_REPRESENTATION_SCOPES,
    excludedCapabilities: [
      "inherit_identity",
      "inherit_credentials",
      "impersonate_owner",
      "unrestricted_private_data_access",
    ] as const,
  };
}
