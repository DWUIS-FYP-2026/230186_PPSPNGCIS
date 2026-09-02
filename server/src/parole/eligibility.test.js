const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateEligibilityDate,
  calculateNotificationDate,
  deriveTotalSentenceYears,
  calculateCooldownMonths,
  recalculateEligibility,
} = require('./eligibility');
const { SENTENCE_TYPES } = require('./constants');

describe('Parole Act 1991 — eligibility (1/2 sentence)', () => {
  it('calculates 1/2 eligibility for a 6-year standard sentence', () => {
    const prisoner = {
      sentenceStartDate: '2020-01-01',
      sentenceEndDate: '2026-01-01',
      sentenceType: SENTENCE_TYPES.STANDARD,
    };
    const totalYears = deriveTotalSentenceYears(prisoner.sentenceStartDate, prisoner.sentenceEndDate);
    assert.ok(Math.abs(totalYears - 6) < 0.05);

    const eligibility = calculateEligibilityDate(prisoner);
    assert.equal(eligibility, '2023-01-01');
  });

  it('uses explicit total_sentence_years when provided', () => {
    const prisoner = {
      sentenceStartDate: '2018-06-01',
      totalSentenceYears: 8,
      sentenceType: SENTENCE_TYPES.STANDARD,
    };
    const eligibility = calculateEligibilityDate(prisoner);
    assert.equal(eligibility, '2022-06-01');
  });

  it('Life sentence — eligible after exactly 10 years', () => {
    const prisoner = {
      sentenceStartDate: '2015-03-10',
      sentenceType: SENTENCE_TYPES.LIFE,
    };
    assert.equal(calculateEligibilityDate(prisoner), '2025-03-10');
  });

  it('notification date is 6 months before eligibility', () => {
    const eligibility = '2024-07-01';
    const notification = calculateNotificationDate(eligibility);
    assert.equal(notification, '2024-01-01');
  });

  it('recalculates when remission reduces time served', () => {
    const prisoner = {
      sentenceStartDate: '2020-01-01',
      sentenceEndDate: '2028-01-01',
      sentenceType: SENTENCE_TYPES.STANDARD,
      remissionDays: 30,
    };
    const calc = recalculateEligibility(prisoner, new Date('2022-06-01T12:00:00Z'));
    assert.ok(calc.timeServedDays >= 850);
    assert.equal(calc.eligibilityDate, calculateEligibilityDate(prisoner));
  });

  it('cooldown is 6 months for sentences under 5 years', () => {
    const prisoner = { sentenceStartDate: '2020-01-01', sentenceEndDate: '2023-01-01', sentenceType: 'Standard' };
    assert.equal(calculateCooldownMonths(prisoner), 6);
  });

  it('cooldown is 12 months for sentences >= 5 years', () => {
    const prisoner = { sentenceStartDate: '2015-01-01', sentenceEndDate: '2025-01-01', sentenceType: 'Standard' };
    assert.equal(calculateCooldownMonths(prisoner), 12);
  });

  it('cooldown is 12 months for Life sentences', () => {
    assert.equal(calculateCooldownMonths({ sentenceType: 'Life', sentenceStartDate: '2010-01-01' }), 12);
  });
});
