const sequelize = require('../config/db');
const {
  CareEpisode,
  Surgery,
  User,
} = require('../models');

async function getColumns(tableName) {
  const [rows] = await sequelize.query(`PRAGMA table_info(${tableName});`);
  return rows.map((row) => row.name);
}

async function addColumnIfMissing(tableName, columnName, definition) {
  const columns = await getColumns(tableName);

  if (columns.includes(columnName)) {
    console.log(`✓ ${tableName}.${columnName} already exists`);
    return false;
  }

  await sequelize.query(
    `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`
  );

  console.log(`+ Added ${tableName}.${columnName}`);
  return true;
}

async function createIndexIfMissing(indexName, tableName, columns) {
  const [rows] = await sequelize.query(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'index'
       AND name = ?;`,
    {
      replacements: [indexName],
    }
  );

  if (rows.length > 0) {
    console.log(`✓ Index ${indexName} already exists`);
    return false;
  }

  await sequelize.query(
    `CREATE INDEX ${indexName}
     ON ${tableName} (${columns.join(', ')});`
  );

  console.log(`+ Created index ${indexName}`);
  return true;
}

async function getBestCareEpisode(patientId, doctorId, surgeryId = null) {
  const where = {
    patientId,
    doctorId,
  };

  if (surgeryId) {
    where.surgeryId = surgeryId;
  }

  const episode = await CareEpisode.findOne({
    where,
    order: [
      ['status', 'DESC'],
      ['startDate', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  });

  return episode;
}

async function migrateMedicalFiles() {
  await addColumnIfMissing(
    'medical_files',
    'careEpisodeId',
    'TEXT'
  );

  await addColumnIfMissing(
    'medical_files',
    'fileSize',
    'INTEGER'
  );

  await createIndexIfMissing(
    'medical_files_care_episode_id',
    'medical_files',
    ['careEpisodeId']
  );
}

async function migrateDoctorNotes() {
  await addColumnIfMissing(
    'doctor_notes',
    'careEpisodeId',
    'TEXT'
  );

  await createIndexIfMissing(
    'doctor_notes_care_episode_id',
    'doctor_notes',
    ['careEpisodeId']
  );
}

async function migrateSurgeries() {
  await addColumnIfMissing(
    'surgeries',
    'surgeryDate',
    'TEXT'
  );

  await addColumnIfMissing(
    'surgeries',
    'description',
    'TEXT'
  );
}

async function migrateMedicines() {
  await addColumnIfMissing(
    'medicines',
    'careEpisodeId',
    'TEXT'
  );

  await addColumnIfMissing(
    'medicines',
    'startDate',
    'TEXT'
  );

  await addColumnIfMissing(
    'medicines',
    'endDate',
    'TEXT'
  );

  await createIndexIfMissing(
    'medicines_care_episode_id',
    'medicines',
    ['careEpisodeId']
  );
}

async function migrateFoodRestrictions() {
  await addColumnIfMissing(
    'food_restrictions',
    'careEpisodeId',
    'TEXT'
  );

  await createIndexIfMissing(
    'food_restrictions_care_episode_id',
    'food_restrictions',
    ['careEpisodeId']
  );
}

async function migrateAppointments() {
  await addColumnIfMissing(
    'appointments',
    'careEpisodeId',
    'TEXT'
  );

  await addColumnIfMissing(
    'appointments',
    'completedAt',
    'TEXT'
  );

  await addColumnIfMissing(
    'appointments',
    'cancelledAt',
    'TEXT'
  );

  await createIndexIfMissing(
    'appointments_care_episode_id',
    'appointments',
    ['careEpisodeId']
  );
}

async function migrateSOSAlerts() {
  await addColumnIfMissing(
    'sos_alerts',
    'careEpisodeId',
    'TEXT'
  );

  await addColumnIfMissing(
    'sos_alerts',
    'escalatedAt',
    'TEXT'
  );

  await addColumnIfMissing(
    'sos_alerts',
    'adminAcknowledgedAt',
    'TEXT'
  );

  await addColumnIfMissing(
    'sos_alerts',
    'resolvedBy',
    'TEXT'
  );

  await createIndexIfMissing(
    'sos_alerts_care_episode_id',
    'sos_alerts',
    ['careEpisodeId']
  );
}

async function migrateChatThreads() {
  await addColumnIfMissing(
    'chat_threads',
    'careEpisodeId',
    'TEXT'
  );

  await createIndexIfMissing(
    'chat_threads_care_episode_id',
    'chat_threads',
    ['careEpisodeId']
  );
}

async function migrateVitalsAssessments() {
  await addColumnIfMissing(
    'vitals_assessments',
    'careEpisodeId',
    'TEXT'
  );

  await addColumnIfMissing(
    'vitals_assessments',
    'measuredAt',
    'TEXT'
  );

  await addColumnIfMissing(
    'vitals_assessments',
    'modelVersion',
    'TEXT'
  );

  await createIndexIfMissing(
    'vitals_assessments_patient_id',
    'vitals_assessments',
    ['patientId']
  );

  await createIndexIfMissing(
    'vitals_assessments_care_episode_id',
    'vitals_assessments',
    ['careEpisodeId']
  );

  await createIndexIfMissing(
    'vitals_assessments_patient_measured_at',
    'vitals_assessments',
    ['patientId', 'measuredAt']
  );

  await createIndexIfMissing(
    'vitals_assessments_episode_measured_at',
    'vitals_assessments',
    ['careEpisodeId', 'measuredAt']
  );
}

async function backfillCareEpisodeColumn({
  tableName,
  idColumn = 'id',
  patientColumn = 'patientId',
  doctorColumn = 'doctorId',
  surgeryColumn = 'surgeryId',
}) {
  const columns = await getColumns(tableName);

  if (!columns.includes('careEpisodeId')) {
    console.log(
      `Skipping backfill for ${tableName}: careEpisodeId is missing`
    );
    return;
  }

  let rows;

  if (
    columns.includes(doctorColumn) &&
    columns.includes(surgeryColumn)
  ) {
    [rows] = await sequelize.query(
      `SELECT ${idColumn}, ${patientColumn}, ${doctorColumn}, ${surgeryColumn}
       FROM ${tableName}
       WHERE careEpisodeId IS NULL;`
    );
  } else if (columns.includes(doctorColumn)) {
    [rows] = await sequelize.query(
      `SELECT ${idColumn}, ${patientColumn}, ${doctorColumn}
       FROM ${tableName}
       WHERE careEpisodeId IS NULL;`
    );
  } else {
    [rows] = await sequelize.query(
      `SELECT ${idColumn}, ${patientColumn}
       FROM ${tableName}
       WHERE careEpisodeId IS NULL;`
    );
  }

  if (rows.length === 0) {
    console.log(`✓ No ${tableName} records require backfill`);
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    let episode = null;

    if (
      columns.includes(doctorColumn) &&
      columns.includes(surgeryColumn)
    ) {
      episode = await getBestCareEpisode(
        row[patientColumn],
        row[doctorColumn],
        row[surgeryColumn]
      );
    } else if (columns.includes(doctorColumn)) {
      episode = await getBestCareEpisode(
        row[patientColumn],
        row[doctorColumn]
      );
    }

    if (!episode) {
      skipped += 1;
      continue;
    }

    await sequelize.query(
      `UPDATE ${tableName}
       SET careEpisodeId = ?
       WHERE ${idColumn} = ?;`,
      {
        replacements: [episode.id, row[idColumn]],
      }
    );

    updated += 1;
  }

  console.log(
    `✓ ${tableName}: backfilled ${updated}, skipped ${skipped}`
  );
}

async function backfillAppointments() {
  const columns = await getColumns('appointments');

  if (!columns.includes('careEpisodeId')) {
    return;
  }

  const [rows] = await sequelize.query(
    `SELECT id, patientId, doctorId
     FROM appointments
     WHERE careEpisodeId IS NULL;`
  );

  if (rows.length === 0) {
    console.log('✓ No appointments require careEpisode backfill');
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const appointment of rows) {
    const episode = await getBestCareEpisode(
      appointment.patientId,
      appointment.doctorId
    );

    if (!episode) {
      skipped += 1;
      continue;
    }

    await sequelize.query(
      `UPDATE appointments
       SET careEpisodeId = ?
       WHERE id = ?;`,
      {
        replacements: [episode.id, appointment.id],
      }
    );

    updated += 1;
  }

  console.log(
    `✓ appointments: backfilled ${updated}, skipped ${skipped}`
  );
}

async function backfillSOSAlerts() {
  const columns = await getColumns('sos_alerts');

  if (!columns.includes('careEpisodeId')) {
    return;
  }

  const [rows] = await sequelize.query(
    `SELECT id, patientId, doctorId
     FROM sos_alerts
     WHERE careEpisodeId IS NULL;`
  );

  if (rows.length === 0) {
    console.log('✓ No SOS alerts require careEpisode backfill');
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const alert of rows) {
    const episode = await getBestCareEpisode(
      alert.patientId,
      alert.doctorId
    );

    if (!episode) {
      skipped += 1;
      continue;
    }

    await sequelize.query(
      `UPDATE sos_alerts
       SET careEpisodeId = ?
       WHERE id = ?;`,
      {
        replacements: [episode.id, alert.id],
      }
    );

    updated += 1;
  }

  console.log(
    `✓ sos_alerts: backfilled ${updated}, skipped ${skipped}`
  );
}

async function backfillChatThreads() {
  const columns = await getColumns('chat_threads');

  if (!columns.includes('careEpisodeId')) {
    return;
  }

  const [rows] = await sequelize.query(
    `SELECT id, patientId, doctorId
     FROM chat_threads
     WHERE careEpisodeId IS NULL;`
  );

  if (rows.length === 0) {
    console.log('✓ No chat threads require careEpisode backfill');
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const thread of rows) {
    const episode = await getBestCareEpisode(
      thread.patientId,
      thread.doctorId
    );

    if (!episode) {
      skipped += 1;
      continue;
    }

    await sequelize.query(
      `UPDATE chat_threads
       SET careEpisodeId = ?
       WHERE id = ?;`,
      {
        replacements: [episode.id, thread.id],
      }
    );

    updated += 1;
  }

  console.log(
    `✓ chat_threads: backfilled ${updated}, skipped ${skipped}`
  );
}

async function backfillVitalsAssessments() {
  const columns = await getColumns('vitals_assessments');

  if (!columns.includes('careEpisodeId')) {
    return;
  }

  const [rows] = await sequelize.query(
    `SELECT id, patientId, createdAt
     FROM vitals_assessments
     WHERE careEpisodeId IS NULL;`
  );

  if (rows.length === 0) {
    console.log('✓ No vitals assessments require careEpisode backfill');
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const assessment of rows) {
    /*
     * Historical assessments may have been created before the
     * CareEpisode architecture existed. For those records we map
     * them to the patient's best available episode.
     */
    const episode = await CareEpisode.findOne({
      where: {
        patientId: assessment.patientId,
      },
      order: [
        ['status', 'DESC'],
        ['startDate', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });

    if (!episode) {
      skipped += 1;
      continue;
    }

    await sequelize.query(
      `UPDATE vitals_assessments
       SET careEpisodeId = ?
       WHERE id = ?;`,
      {
        replacements: [episode.id, assessment.id],
      }
    );

    updated += 1;
  }

  console.log(
    `✓ vitals_assessments: backfilled ${updated}, skipped ${skipped}`
  );
}

async function backfillMedicalFiles() {
  await backfillCareEpisodeColumn({
    tableName: 'medical_files',
  });
}

async function backfillDoctorNotes() {
  await backfillCareEpisodeColumn({
    tableName: 'doctor_notes',
  });
}

async function backfillMedicines() {
  await backfillCareEpisodeColumn({
    tableName: 'medicines',
  });
}

async function backfillFoodRestrictions() {
  await backfillCareEpisodeColumn({
    tableName: 'food_restrictions',
  });
}

async function ensureCareEpisodesForExistingSurgeries() {
  const surgeries = await Surgery.findAll({
    where: {
      status: 'active',
    },
    order: [['createdAt', 'ASC']],
  });

  console.log(
    `Found ${surgeries.length} active surgeries.`
  );

  let created = 0;
  let skipped = 0;

  for (const surgery of surgeries) {
    const existingEpisode = await CareEpisode.findOne({
      where: {
        surgeryId: surgery.id,
      },
    });

    if (existingEpisode) {
      skipped += 1;
      continue;
    }

    const days = Number.isFinite(Number(surgery.recoveryDays))
      ? Math.max(Number(surgery.recoveryDays), 1)
      : 14;

    const startDate =
      surgery.surgeryDate ||
      surgery.createdAt ||
      new Date();

    await CareEpisode.create({
      patientId: surgery.patientId,
      doctorId: surgery.doctorId,
      surgeryId: surgery.id,
      status: 'active',
      startDate,
      expectedRecoveryDays: days,
      daysRemaining: days,
    });

    created += 1;
  }

  console.log(
    `Created ${created} care episodes. Skipped ${skipped} existing care episodes.`
  );
}

async function ensureVitalsDefaults() {
  const columns = await getColumns('vitals_assessments');

  if (!columns.includes('measuredAt')) {
    return;
  }

  await sequelize.query(
    `UPDATE vitals_assessments
     SET measuredAt = createdAt
     WHERE measuredAt IS NULL OR measuredAt = '';`
  );

  console.log('✓ vitals measuredAt defaults backfilled');

  if (columns.includes('modelVersion')) {
    await sequelize.query(
      `UPDATE vitals_assessments
       SET modelVersion = 'v1-baseline'
       WHERE modelVersion IS NULL OR modelVersion = '';`
    );

    console.log('✓ vitals modelVersion defaults backfilled');
  }
}

async function run() {
  try {
    await sequelize.authenticate();

    console.log('');
    console.log('==============================================');
    console.log('CareEpisode schema migration starting...');
    console.log('==============================================');
    console.log('');

    await ensureCareEpisodesForExistingSurgeries();

    await migrateSurgeries();
    await migrateMedicalFiles();
    await migrateDoctorNotes();
    await migrateMedicines();
    await migrateFoodRestrictions();
    await migrateAppointments();
    await migrateSOSAlerts();
    await migrateChatThreads();
    await migrateVitalsAssessments();

    console.log('');
    console.log('--- Backfilling CareEpisode references ---');
    console.log('');

    await backfillMedicalFiles();
    await backfillDoctorNotes();
    await backfillMedicines();
    await backfillFoodRestrictions();
    await backfillAppointments();
    await backfillSOSAlerts();
    await backfillChatThreads();
    await backfillVitalsAssessments();

    await ensureVitalsDefaults();

    console.log('');
    console.log('==============================================');
    console.log('CareEpisode schema migration completed.');
    console.log('==============================================');
    console.log('');

    await sequelize.close();
  } catch (error) {
    console.error('');
    console.error('Migration failed.');
    console.error(error);
    console.error('');

    try {
      await sequelize.close();
    } catch (_) {
      // Ignore close errors.
    }

    process.exit(1);
  }
}

run();