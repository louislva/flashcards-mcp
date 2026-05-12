import type { Flashcard } from "./store.js";
import { createEmptyCard, fsrs, Rating, State, type Card, type CardInput, type Grade } from "ts-fsrs";

type FsrsState = Flashcard["fsrs_state"];

type ScheduleFields = Pick<
  Flashcard,
  | "next_review"
  | "scheduled_days"
  | "stability"
  | "difficulty"
  | "fsrs_state"
  | "review_count"
  | "lapse_count"
  | "learning_steps"
  | "last_review"
>;

type LegacyFlashcard = Flashcard & {
  interval_days?: unknown;
  ease_factor?: unknown;
  repetitions?: unknown;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const scheduler = fsrs();

const FSRS_STATE_NAMES = {
  [State.New]: "New",
  [State.Learning]: "Learning",
  [State.Review]: "Review",
  [State.Relearning]: "Relearning",
} as const satisfies Record<State, FsrsState>;

const FSRS_STATES = new Set<FsrsState>(["New", "Learning", "Review", "Relearning"]);

export function initialSchedule(now = new Date()): ScheduleFields {
  return scheduleFromFsrsCard(createEmptyCard(now));
}

export function nextReview(card: Flashcard, quality: number, reviewedAt = new Date()): Flashcard {
  const result = scheduler.next(toFsrsCard(card, reviewedAt), reviewedAt, ratingFromQuality(quality));
  const { interval_days, ease_factor, repetitions, ...withoutSm2Fields } = card as LegacyFlashcard;
  return {
    ...withoutSm2Fields,
    ...scheduleFromFsrsCard(result.card),
  };
}

export function formatNextReview(nextReview: string, from = new Date()): string {
  const due = parseDate(nextReview, from);
  return `${formatDelay(due, from)} (${formatDateTime(due)})`;
}

export function formatDueStatus(nextReview: string, from = new Date()): string {
  const due = parseDate(nextReview, from);
  if (due.getTime() <= from.getTime()) return "DUE";
  return `next: ${formatDateTime(due)} (${formatDelay(due, from)})`;
}

function toFsrsCard(card: Flashcard, now: Date): CardInput {
  const legacy = card as LegacyFlashcard;
  const due = parseDate(card.next_review, now);
  const scheduledDays = nonNegativeInteger(card.scheduled_days, nonNegativeInteger(legacy.interval_days, 0));
  const reviewCount = nonNegativeInteger(card.review_count, nonNegativeInteger(legacy.repetitions, 0));
  const state = toFsrsState(card.fsrs_state, reviewCount, scheduledDays);
  const lastReview = parseOptionalDate(card.last_review) ?? approximateLastReview(due, scheduledDays);

  return {
    due,
    stability: fsrsNumber(card.stability, state === State.New ? 0 : Math.max(scheduledDays, 0.1)),
    difficulty: fsrsNumber(card.difficulty, state === State.New ? 0 : difficultyFromLegacyEase(legacy.ease_factor)),
    elapsed_days: lastReview ? Math.max(0, Math.round((now.getTime() - lastReview.getTime()) / DAY_MS)) : 0,
    scheduled_days: scheduledDays,
    learning_steps: nonNegativeInteger(card.learning_steps, 0),
    reps: reviewCount,
    lapses: nonNegativeInteger(card.lapse_count, 0),
    state,
    last_review: lastReview,
  };
}

function scheduleFromFsrsCard(card: Card): ScheduleFields {
  return {
    next_review: card.due.toISOString(),
    scheduled_days: card.scheduled_days,
    stability: round(card.stability),
    difficulty: round(card.difficulty),
    fsrs_state: FSRS_STATE_NAMES[card.state],
    review_count: card.reps,
    lapse_count: card.lapses,
    learning_steps: card.learning_steps,
    last_review: card.last_review?.toISOString(),
  };
}

function ratingFromQuality(quality: number): Grade {
  switch (quality) {
    case 1:
      return Rating.Again;
    case 2:
      return Rating.Hard;
    case 3:
      return Rating.Good;
    case 4:
      return Rating.Easy;
    default:
      throw new Error(`Invalid review quality: ${quality}`);
  }
}

function toFsrsState(value: unknown, reviewCount: number, scheduledDays: number): State {
  if (typeof value === "number" && value in FSRS_STATE_NAMES) return value as State;
  if (typeof value === "string" && FSRS_STATES.has(value as FsrsState)) {
    return State[value as FsrsState];
  }
  if (reviewCount === 0) return State.New;
  return scheduledDays > 0 ? State.Review : State.Learning;
}

function parseDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return fallback;
}

function parseOptionalDate(value: unknown): Date | undefined {
  const parsed = parseDate(value, new Date(Number.NaN));
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function approximateLastReview(due: Date, scheduledDays: number): Date | undefined {
  if (scheduledDays <= 0) return undefined;
  return new Date(due.getTime() - scheduledDays * DAY_MS);
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const n = asNumber(value);
  return n !== undefined && n >= 0 ? Math.round(n) : fallback;
}

function fsrsNumber(value: unknown, fallback: number): number {
  const n = asNumber(value);
  return n !== undefined && n >= 0 ? n : fallback;
}

function difficultyFromLegacyEase(value: unknown): number {
  const ease = asNumber(value);
  if (ease === undefined) return 5;
  return clamp(11 - ease * 3, 1, 10);
}

function asNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function formatDelay(due: Date, from: Date): string {
  const diffMs = due.getTime() - from.getTime();
  if (diffMs <= 0) return "now";

  const minutes = Math.max(1, Math.round(diffMs / MINUTE_MS));
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? "" : "s"}`;

  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

function formatDateTime(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
