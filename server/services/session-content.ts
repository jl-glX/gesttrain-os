import { db } from "../db/client.js";
import type { SessionContentBlock } from "../db/types.js";

function parseStringArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseBlocks(value: string | null | undefined): SessionContentBlock[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as SessionContentBlock[]) : [];
  } catch {
    return [];
  }
}

export async function getSessionContent(classId: string) {
  const gymClass = await db
    .selectFrom("gymClasses")
    .select(["id", "name", "trainerId"])
    .where("id", "=", classId)
    .executeTakeFirst();
  if (!gymClass) throw new Error("Class not found");
  const content = await db
    .selectFrom("classSessionContents")
    .selectAll()
    .where("classId", "=", classId)
    .executeTakeFirst();
  return {
    classId,
    className: gymClass.name,
    trainerId: gymClass.trainerId,
    terminology: content?.terminology ?? "Contenido de la sesión",
    blocks: parseBlocks(content?.blocks),
    commentsEnabled: content?.commentsEnabled === 1,
    updatedAt: content?.updatedAt ?? null,
  };
}

export async function saveSessionContent(
  classId: string,
  input: {
    terminology: string;
    blocks: SessionContentBlock[];
    commentsEnabled: boolean;
  },
) {
  const uniqueBlockIds = new Set(input.blocks.map((block) => block.id));
  if (uniqueBlockIds.size !== input.blocks.length) {
    throw new Error("Session block identifiers must be unique");
  }
  const exists = await db
    .selectFrom("gymClasses")
    .select("id")
    .where("id", "=", classId)
    .executeTakeFirst();
  if (!exists) throw new Error("Class not found");
  await db
    .insertInto("classSessionContents")
    .values({
      classId,
      terminology: input.terminology,
      blocks: JSON.stringify(input.blocks),
      commentsEnabled: input.commentsEnabled ? 1 : 0,
      updatedAt: Date.now(),
    })
    .onConflict((conflict) =>
      conflict.column("classId").doUpdateSet({
        terminology: input.terminology,
        blocks: JSON.stringify(input.blocks),
        commentsEnabled: input.commentsEnabled ? 1 : 0,
        updatedAt: Date.now(),
      }),
    )
    .execute();
  return getSessionContent(classId);
}

export async function getSessionProgress(classId: string, userId: string) {
  const gymClass = await db
    .selectFrom("gymClasses")
    .select("id")
    .where("id", "=", classId)
    .executeTakeFirst();
  if (!gymClass) throw new Error("Class not found");
  const progress = await db
    .selectFrom("sessionContentProgress")
    .selectAll()
    .where("classId", "=", classId)
    .where("userId", "=", userId)
    .executeTakeFirst();
  return {
    classId,
    userId,
    completedBlockIds: parseStringArray(progress?.completedBlockIds),
    notes: progress?.notes ?? "",
    updatedAt: progress?.updatedAt ?? null,
  };
}

export async function saveSessionProgress(
  classId: string,
  userId: string,
  input: { completedBlockIds: string[]; notes: string },
) {
  const content = await getSessionContent(classId);
  const validIds = new Set(content.blocks.map((block) => block.id));
  const completedBlockIds = [...new Set(input.completedBlockIds)].filter((id) =>
    validIds.has(id),
  );
  const updatedAt = Date.now();
  await db
    .insertInto("sessionContentProgress")
    .values({
      classId,
      userId,
      completedBlockIds: JSON.stringify(completedBlockIds),
      notes: input.notes,
      updatedAt,
    })
    .onConflict((conflict) =>
      conflict.columns(["classId", "userId"]).doUpdateSet({
        completedBlockIds: JSON.stringify(completedBlockIds),
        notes: input.notes,
        updatedAt,
      }),
    )
    .execute();
  return getSessionProgress(classId, userId);
}
