require('dotenv').config();

const sequelize = require('../config/db');
const {
  Surgery,
  CareEpisode,
} = require('../models');

async function backfillCareEpisodes() {
  try {
    await sequelize.authenticate();

    console.log('Database connection established.');

    const activeSurgeries = await Surgery.findAll({
      where: {
        status: 'active',
      },
    });

    console.log(`Found ${activeSurgeries.length} active surgeries.`);

    let created = 0;
    let skipped = 0;

    for (const surgery of activeSurgeries) {
      const existing = await CareEpisode.findOne({
        where: {
          surgeryId: surgery.id,
        },
      });

      if (existing) {
        skipped += 1;
        continue;
      }

      const expectedRecoveryDays =
        surgery.recoveryTotalDays || 14;

      const daysRemaining =
        surgery.recoveryDaysRemaining ?? expectedRecoveryDays;

      await CareEpisode.create({
        patientId: surgery.patientId,
        doctorId: surgery.doctorId,
        surgeryId: surgery.id,
        status: 'active',
        startDate:
          surgery.startDate ||
          new Date().toISOString().slice(0, 10),
        expectedRecoveryDays,
        daysRemaining: Math.max(0, daysRemaining),
      });

      created += 1;
    }

    console.log(`Created ${created} care episodes.`);
    console.log(`Skipped ${skipped} existing care episodes.`);
    console.log('Care episode backfill completed successfully.');
  } catch (error) {
    console.error('Care episode backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

backfillCareEpisodes();