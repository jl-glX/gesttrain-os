import { performance } from "node:perf_hooks";
import { randomBytes } from "node:crypto";
import bcryptjs from "bcryptjs";

const weakLaboratoryPassword = "LaboratoryOnlyPassword123";
const strongLaboratoryPassword = `${randomBytes(24).toString("base64url")}Aa1`;
const candidates = [
  "Password123456",
  "GestTrain2026",
  "SummerTraining123",
  "Administrator123",
  "GymPassword123",
  weakLaboratoryPassword,
];

const hashStartedAt = performance.now();
const weakLaboratoryHash = await bcryptjs.hash(weakLaboratoryPassword, 12);
const hashDurationMs = performance.now() - hashStartedAt;

const comparisonStartedAt = performance.now();
let matchedAt = -1;
for (const [index, candidate] of candidates.entries()) {
  if (await bcryptjs.compare(candidate, weakLaboratoryHash)) {
    matchedAt = index;
    break;
  }
}
const comparisonDurationMs = performance.now() - comparisonStartedAt;
const attempts = matchedAt + 1;

const strongHash = await bcryptjs.hash(strongLaboratoryPassword, 12);
const strongComparisonStartedAt = performance.now();
let strongMatched = false;
for (const candidate of candidates) {
  if (await bcryptjs.compare(candidate, strongHash)) {
    strongMatched = true;
    break;
  }
}
const strongComparisonDurationMs =
  performance.now() - strongComparisonStartedAt;

const sharedPrefix = `Aa1${"x".repeat(69)}`;
const firstOversizedPassword = `${sharedPrefix}ONE`;
const secondOversizedPassword = `${sharedPrefix}TWO`;
const truncatedHash = await bcryptjs.hash(firstOversizedPassword, 12);
const bcryptWouldAliasBeyondLimit = await bcryptjs.compare(
  secondOversizedPassword,
  truncatedHash,
);

console.log(
  JSON.stringify(
    {
      scope: "self-generated laboratory credential",
      bcryptCost: 12,
      hashDurationMs: Math.round(hashDurationMs),
      dictionaryAttempts: attempts,
      comparisonDurationMs: Math.round(comparisonDurationMs),
      comparisonsPerSecond: Number(
        ((attempts * 1000) / comparisonDurationMs).toFixed(2),
      ),
      weakPasswordMatched: matchedAt >= 0,
      randomStrongPasswordDictionaryAttempts: candidates.length,
      randomStrongPasswordComparisonDurationMs: Math.round(
        strongComparisonDurationMs,
      ),
      randomStrongPasswordMatched: strongMatched,
      bcryptWouldAliasBeyond72Bytes: bcryptWouldAliasBeyondLimit,
      applicationPolicy: "Inputs longer than 72 UTF-8 bytes are rejected",
      note: "Only synthetic credentials generated for this local run were tested.",
    },
    null,
    2,
  ),
);
