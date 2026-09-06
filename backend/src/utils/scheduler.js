const cron = require('node-cron');

const { CareEpisode, Surgery } = require('../models');
const { computeRecovery } = require('./recovery');

/*
 * Every read path that shows a recovery countdown now computes it live
 * from `startDate` + `expectedRecoveryDays` (see utils/recovery.js), so
 * this job is not the source of truth for what gets displayed. It exists
 * so the stored `daysRemaining` / `recoveryDaysRemaining` columns
 * themselves stay reasonably fresh for any other code (reports, future
 * features, direct database inspection) that reads them without going
 * through the shared helper.
 */
async function refreshActiveRecoveryCounters() {
  const activeEpisodes = await CareEpisode.findAll({
    where: { status: 'active' },
    include: [{ model: Surgery, as: 'surgery' }],
  });

  for (const episode of activeEpisodes) {
    const { daysRemaining } = computeRecovery(
      episode.startDate,
      episode.expectedRecoveryDays
    );

    if (episode.daysRemaining !== daysRemaining) {
      episode.daysRemaining = daysRemaining;
      await episode.save();
    }

    const surgery = episode.surgery;

    if (surgery && surgery.status === 'active') {
      if (surgery.recoveryDaysRemaining !== daysRemaining) {
        surgery.recoveryDaysRemaining = daysRemaining;
        await surgery.save();
      }
    }
  }

  return activeEpisodes.length;
}

/*
 * Runs once a day at 00:05 server time. Also runs once immediately on
 * startup so stored values are correct right away rather than waiting
 * for the next scheduled tick (useful right after a deploy or restart).
 */
function startRecoveryScheduler() {
  refreshActiveRecoveryCounters().catch((err) => {
    console.error('Initial recovery counter refresh failed:', err);
  });

  cron.schedule('5 0 * * *', () => {
    refreshActiveRecoveryCounters().catch((err) => {
      console.error('Scheduled recovery counter refresh failed:', err);
    });
  });
}

module.exports = { startRecoveryScheduler, refreshActiveRecoveryCounters };
