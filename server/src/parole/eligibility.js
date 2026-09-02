/**
 * Parole Act 1991 — eligibility calculation (1/2 sentence; life = 10 years).
 */
const {
  SENTENCE_TYPES,
  LIFE_ELIGIBILITY_YEARS,
  ELIGIBILITY_FRACTION,
  NOTIFICATION_MONTHS_BEFORE,
} = require('./constants');

const MS_PER_DAY = 86400000;
const DAYS_PER_YEAR = 365.25;

function parseDateOnly(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) throw new Error('Invalid date.');
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

function toDateString(date) {
  const d = date instanceof Date ? date : parseDateOnly(date);
  return d.toISOString().slice(0, 10);
}

function deriveTotalSentenceYears(sentenceStartDate, sentenceEndDate) {
  const start = parseDateOnly(sentenceStartDate);
  const end = parseDateOnly(sentenceEndDate);
  if (end <= start) throw new Error('Sentence end must be after sentence start.');
  const days = (end - start) / MS_PER_DAY;
  return days / DAYS_PER_YEAR;
}

function addYears(date, years) {
  const d = parseDateOnly(date);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

function subtractMonths(date, months) {
  const d = parseDateOnly(date);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

function addMonths(date, months) {
  const d = parseDateOnly(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function normalizePrisonerInput(prisoner) {
  return {
    sentenceStartDate: prisoner.sentence_start_date || prisoner.sentenceStartDate,
    sentenceEndDate: prisoner.sentence_end_date || prisoner.sentenceEndDate,
    sentenceType: prisoner.sentence_type || prisoner.sentenceType || SENTENCE_TYPES.STANDARD,
    totalSentenceYears: prisoner.total_sentence_years ?? prisoner.totalSentenceYears ?? null,
    remissionDays: prisoner.remission_days ?? prisoner.remissionDays ?? 0,
  };
}

/**
 * Eligibility_Date = Sentence_Start + (Total_Sentence_Years * 0.5)
 * Life: Eligibility_Date = Sentence_Start + 10 years
 */
function calculateEligibilityDate(prisoner, asOf = new Date()) {
  const p = normalizePrisonerInput(prisoner);
  if (!p.sentenceStartDate) throw new Error('sentence_start_date is required.');

  const start = parseDateOnly(p.sentenceStartDate);

  if (p.sentenceType === SENTENCE_TYPES.LIFE) {
    return toDateString(addYears(start, LIFE_ELIGIBILITY_YEARS));
  }

  let totalYears = p.totalSentenceYears;
  if (totalYears == null) {
    if (!p.sentenceEndDate) throw new Error('total_sentence_years or sentence_end_date is required for Standard sentences.');
    totalYears = deriveTotalSentenceYears(p.sentenceStartDate, p.sentenceEndDate);
  }

  const halfDays = Math.round(totalYears * ELIGIBILITY_FRACTION * DAYS_PER_YEAR);
  const eligibility = parseDateOnly(p.sentenceStartDate);
  eligibility.setUTCDate(eligibility.getUTCDate() + halfDays);
  return toDateString(eligibility);
}

/** Notification triggers 6 months before eligibility date. */
function calculateNotificationDate(eligibilityDate) {
  return toDateString(subtractMonths(eligibilityDate, NOTIFICATION_MONTHS_BEFORE));
}

function calculateTimeServedDays(prisoner, asOf = new Date()) {
  const p = normalizePrisonerInput(prisoner);
  const start = parseDateOnly(p.sentenceStartDate);
  const today = parseDateOnly(asOf);
  const raw = Math.floor((today - start) / MS_PER_DAY);
  const remission = Number(p.remissionDays) || 0;
  return Math.max(0, raw - remission);
}

function recalculateEligibility(prisoner, asOf = new Date()) {
  const eligibilityDate = calculateEligibilityDate(prisoner, asOf);
  const notificationDate = calculateNotificationDate(eligibilityDate);
  const timeServedDays = calculateTimeServedDays(prisoner, asOf);
  let totalSentenceYears = prisoner.total_sentence_years ?? prisoner.totalSentenceYears ?? null;
  const p = normalizePrisonerInput(prisoner);
  if (totalSentenceYears == null && p.sentenceType === SENTENCE_TYPES.STANDARD && p.sentenceEndDate) {
    totalSentenceYears = deriveTotalSentenceYears(p.sentenceStartDate, p.sentenceEndDate);
  }
  return {
    eligibilityDate,
    notificationDate,
    timeServedDays,
    totalSentenceYears,
    sentenceType: p.sentenceType,
    isNotificationDue: parseDateOnly(asOf) >= parseDateOnly(notificationDate),
    isEligibleByTime: parseDateOnly(asOf) >= parseDateOnly(eligibilityDate),
  };
}

/** Cooldown: 6 months if sentence < 5 years; 12 months if >= 5 years or Life. */
function calculateCooldownMonths(prisoner) {
  const p = normalizePrisonerInput(prisoner);
  if (p.sentenceType === SENTENCE_TYPES.LIFE) return 12;
  let totalYears = p.totalSentenceYears;
  if (totalYears == null && p.sentenceEndDate) {
    totalYears = deriveTotalSentenceYears(p.sentenceStartDate, p.sentenceEndDate);
  }
  if (totalYears == null) return 6;
  return totalYears >= 5 ? 12 : 6;
}

function calculateCooldownUntil(prisoner, deniedAt = new Date()) {
  const months = calculateCooldownMonths(prisoner);
  return toDateString(addMonths(deniedAt, months));
}

module.exports = {
  parseDateOnly,
  toDateString,
  deriveTotalSentenceYears,
  calculateEligibilityDate,
  calculateNotificationDate,
  calculateTimeServedDays,
  recalculateEligibility,
  calculateCooldownMonths,
  calculateCooldownUntil,
  DAYS_PER_YEAR,
  MS_PER_DAY,
};
