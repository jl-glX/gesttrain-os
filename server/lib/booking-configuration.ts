export type BookingVisibility = "public" | "members" | "staff";

export type BookingConfiguration = {
  activity: string;
  room: string;
  durationMinutes: number;
  level: string;
  visibility: BookingVisibility;
  material: string[];
  bookingOpensAt: number | null;
  bookingClosesAt: number | null;
  waitlistEnabled: boolean;
  confirmationRequired: boolean;
  remindersEnabled: boolean;
  onTimeCancellationMinutes: number;
  lateCancellationMinutes: number;
  restrictions: string[];
  priorities: string[];
  exceptions: string[];
  allowedRoles: string[];
  allowedMemberships: string[];
};

export const defaultBookingConfiguration: BookingConfiguration = {
  activity: "",
  room: "",
  durationMinutes: 60,
  level: "all",
  visibility: "members",
  material: [],
  bookingOpensAt: null,
  bookingClosesAt: null,
  waitlistEnabled: true,
  confirmationRequired: true,
  remindersEnabled: true,
  onTimeCancellationMinutes: 180,
  lateCancellationMinutes: 60,
  restrictions: [],
  priorities: [],
  exceptions: [],
  allowedRoles: ["member"],
  allowedMemberships: [],
};

export function parseBookingConfiguration(
  value: string | null | undefined,
): BookingConfiguration {
  if (!value) return { ...defaultBookingConfiguration };
  try {
    const parsed = JSON.parse(value) as Partial<BookingConfiguration>;
    return { ...defaultBookingConfiguration, ...parsed };
  } catch {
    return { ...defaultBookingConfiguration };
  }
}
