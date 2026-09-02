/**
 * Daily cron — 6-month pre-eligibility check (Parole Act 1991).
 */
const { runDailyEligibilityCheck } = require('../parole/service');

const MS_PER_DAY = 86400000;
let timer = null;

async function executeJob() {
  try {
    const results = await runDailyEligibilityCheck(new Date());
    if (results.length) {
      console.log(`[parole-job] Promoted ${results.length} case(s) to ELIGIBLE.`);
    }
    return results;
  } catch (err) {
    console.error('[parole-job] Eligibility check failed:', err.message);
    throw err;
  }
}

function startParoleEligibilityJob(options = {}) {
  const intervalMs = options.intervalMs || MS_PER_DAY;
  const runOnStart = options.runOnStart !== false;

  if (runOnStart) {
    executeJob().catch(() => { /* logged */ });
  }

  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    executeJob().catch(() => { /* logged */ });
  }, intervalMs);

  console.log(`[parole-job] Scheduled daily eligibility check (every ${Math.round(intervalMs / 3600000)}h).`);
  return { stop: () => { if (timer) clearInterval(timer); timer = null; } };
}

module.exports = { executeJob, startParoleEligibilityJob };
