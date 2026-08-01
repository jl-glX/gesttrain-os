import { db } from "../db/client.js";
import { randomUUID } from "node:crypto";
import type { Transaction } from "kysely";
import type { Database } from "../db/types.js";

export async function getClassWithAvailability(classId: string) {
  const gymClass = await db
    .selectFrom("gymClasses")
    .selectAll()
    .where("id", "=", classId)
    .executeTakeFirst();

  if (!gymClass) {
    return null;
  }

  const confirmedCount = await db
    .selectFrom("bookings")
    .select((eb) => eb.fn.count("id").as("count"))
    .where("classId", "=", classId)
    .where("status", "=", "confirmed")
    .executeTakeFirst();

  const bookedCount = Number(confirmedCount?.count ?? 0);
  const availablePlaces = gymClass.maxCapacity - bookedCount;
  const waitlistCount = await db
    .selectFrom("waitlistEntries")
    .select((eb) => eb.fn.count("id").as("count"))
    .where("classId", "=", classId)
    .where("promotedAt", "is", null)
    .executeTakeFirst();

  return {
    ...gymClass,
    bookedCount,
    availablePlaces,
    waitlistCount: Number(waitlistCount?.count ?? 0),
  };
}

export async function bookClass(classId: string, userId: string) {
  return db.transaction().execute(async (transaction) => {
    const gymClass = await transaction
      .selectFrom("gymClasses")
      .select(["id", "maxCapacity"])
      .where("id", "=", classId)
      .executeTakeFirst();

    if (!gymClass) throw new Error("Class not found");

    const existingBooking = await transaction
      .selectFrom("bookings")
      .select("id")
      .where("classId", "=", classId)
      .where("userId", "=", userId)
      .where("status", "!=", "cancelled")
      .executeTakeFirst();
    if (existingBooking) {
      throw new Error("User already has a booking for this class");
    }

    const [confirmedCount, waitlistCount] = await Promise.all([
      transaction
        .selectFrom("bookings")
        .select((eb) => eb.fn.count("id").as("count"))
        .where("classId", "=", classId)
        .where("status", "=", "confirmed")
        .executeTakeFirst(),
      transaction
        .selectFrom("waitlistEntries")
        .select((eb) => eb.fn.count("id").as("count"))
        .where("classId", "=", classId)
        .where("promotedAt", "is", null)
        .executeTakeFirst(),
    ]);
    const now = Date.now();
    const bookingId = `booking-${randomUUID()}`;

    if (Number(confirmedCount?.count ?? 0) < gymClass.maxCapacity) {
      await transaction
        .insertInto("bookings")
        .values({
          id: bookingId,
          classId,
          userId,
          status: "confirmed",
          createdAt: now,
          cancelledAt: null,
        })
        .execute();
      return { bookingId, status: "confirmed" as const };
    }

    const position = Number(waitlistCount?.count ?? 0) + 1;
    await transaction
      .insertInto("waitlistEntries")
      .values({
        id: `waitlist-${randomUUID()}`,
        classId,
        userId,
        position,
        createdAt: now,
        promotedAt: null,
      })
      .execute();
    await transaction
      .insertInto("bookings")
      .values({
        id: bookingId,
        classId,
        userId,
        status: "waitlist",
        createdAt: now,
        cancelledAt: null,
      })
      .execute();
    return { bookingId, status: "waitlist" as const, position };
  });
}

export async function cancelBooking(bookingId: string, userId: string) {
  await db.transaction().execute(async (transaction) => {
    const booking = await transaction
      .selectFrom("bookings")
      .selectAll()
      .where("id", "=", bookingId)
      .where("userId", "=", userId)
      .executeTakeFirst();

    if (!booking) throw new Error("Booking not found or not owned by user");
    if (booking.status === "cancelled") {
      throw new Error("Booking already cancelled");
    }

    await transaction
      .updateTable("bookings")
      .set({ status: "cancelled", cancelledAt: Date.now() })
      .where("id", "=", bookingId)
      .execute();

    if (booking.status === "waitlist") {
      await transaction
        .deleteFrom("waitlistEntries")
        .where("classId", "=", booking.classId)
        .where("userId", "=", userId)
        .execute();
      await normalizeWaitlistPositions(transaction, booking.classId);
    } else {
      await promoteFromWaitlist(transaction, booking.classId);
    }
  });
}

async function promoteFromWaitlist(
  transaction: Transaction<Database>,
  classId: string,
) {
  const nextInWaitlist = await transaction
    .selectFrom("waitlistEntries")
    .selectAll()
    .where("classId", "=", classId)
    .where("promotedAt", "is", null)
    .orderBy("position", "asc")
    .limit(1)
    .executeTakeFirst();

  if (!nextInWaitlist) {
    return; // No one in waitlist
  }

  // Update waitlist entry as promoted
  await transaction
    .updateTable("waitlistEntries")
    .set({ promotedAt: Date.now() })
    .where("id", "=", nextInWaitlist.id)
    .execute();

  // Update booking status to confirmed
  await transaction
    .updateTable("bookings")
    .set({ status: "confirmed" })
    .where("classId", "=", classId)
    .where("userId", "=", nextInWaitlist.userId)
    .where("status", "=", "waitlist")
    .execute();

  await normalizeWaitlistPositions(transaction, classId);
}

async function normalizeWaitlistPositions(
  transaction: Transaction<Database>,
  classId: string,
) {
  const remaining = await transaction
    .selectFrom("waitlistEntries")
    .select(["id", "position"])
    .where("classId", "=", classId)
    .where("promotedAt", "is", null)
    .orderBy("position", "asc")
    .execute();

  for (let i = 0; i < remaining.length; i++) {
    await transaction
      .updateTable("waitlistEntries")
      .set({ position: i + 1 })
      .where("id", "=", remaining[i].id)
      .execute();
  }
}

export async function getUserBookings(userId: string) {
  const bookings = await db
    .selectFrom("bookings")
    .innerJoin("gymClasses", "bookings.classId", "gymClasses.id")
    .select([
      "bookings.id",
      "bookings.classId",
      "bookings.status",
      "bookings.createdAt",
      "gymClasses.name",
      "gymClasses.scheduledAt",
      "gymClasses.trainerName",
    ])
    .where("bookings.userId", "=", userId)
    .where("bookings.status", "!=", "cancelled")
    .orderBy("gymClasses.scheduledAt", "desc")
    .execute();

  return bookings;
}

export async function getClassBookings(classId: string) {
  const bookings = await db
    .selectFrom("bookings")
    .innerJoin("users", "bookings.userId", "users.id")
    .select([
      "bookings.id",
      "bookings.userId",
      "bookings.status",
      "users.name",
      "users.email",
    ])
    .where("bookings.classId", "=", classId)
    .where("bookings.status", "=", "confirmed")
    .orderBy("bookings.createdAt", "asc")
    .execute();

  return bookings;
}

export async function getClassWaitlist(classId: string) {
  const waitlist = await db
    .selectFrom("waitlistEntries")
    .innerJoin("users", "waitlistEntries.userId", "users.id")
    .select([
      "waitlistEntries.id",
      "waitlistEntries.userId",
      "waitlistEntries.position",
      "waitlistEntries.createdAt",
      "users.name",
      "users.email",
    ])
    .where("waitlistEntries.classId", "=", classId)
    .where("waitlistEntries.promotedAt", "is", null)
    .orderBy("waitlistEntries.position", "asc")
    .execute();

  return waitlist;
}

export async function exportClassAttendeesCsv(
  classId: string,
): Promise<string> {
  const gymClass = await db
    .selectFrom("gymClasses")
    .selectAll()
    .where("id", "=", classId)
    .executeTakeFirst();

  if (!gymClass) {
    throw new Error("Class not found");
  }

  const attendees = await getClassBookings(classId);
  const waitlist = await getClassWaitlist(classId);

  const rows: string[] = [];

  // CSV Header
  rows.push('"Name","Email","Status","Waitlist Position"');

  // Confirmed attendees
  attendees.forEach((attendee) => {
    const name = escapeCsvCell(attendee.name);
    const email = escapeCsvCell(attendee.email);
    rows.push(`"${name}","${email}","Confirmed",""`);
  });

  // Waitlist entries
  waitlist.forEach((entry) => {
    const name = escapeCsvCell(entry.name);
    const email = escapeCsvCell(entry.email);
    rows.push(`"${name}","${email}","Waitlist","${entry.position}"`);
  });

  return rows.join("\n");
}

function escapeCsvCell(value: string): string {
  const safeValue = /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value;
  return safeValue.replace(/"/g, '""');
}
