const { Op } = require('sequelize');
const sequelize = require('../config/db');
const {
  CareEpisode,
  Surgery,
  Appointment,
  ChatThread,
  SOSAlert,
} = require('../models');
const { computeRecovery } = require('./recovery');
const { todayInAppTz } = require('./dates');
const { notifyPatientAndDoctor, notifyUser } = require('./realtime');

/*
 * A recovery ends by itself when its planned days run out - there is no
 * manual discharge. Completing it keeps the surgery in history, cancels the
 * patient's leftover appointments, closes (archives) open chats and resolves
 * acknowledged SOS alerts, all in one transaction.
 *
 * Returns true if this call completed the episode, false if it was already
 * completed by someone else (so two triggers racing can't double-run it).
 */
async function completeEpisode(episode, io) {
  const { id: episodeId, doctorId, patientId } = episode;
  const today = todayInAppTz();

  const upcoming = await Appointment.findAll({
    where: { doctorId, patientId, status: 'upcoming' },
  });
  const openThreads = await ChatThread.findAll({
    where: { doctorId, patientId, status: 'open' },
  });

  const won = await sequelize.transaction(async (transaction) => {
    // The guard: only the caller that flips active -> completed carries on.
    const [changed] = await CareEpisode.update(
      { status: 'completed', daysRemaining: 0, completedAt: new Date(), dischargeDate: today },
      { where: { id: episodeId, status: 'active' }, transaction }
    );

    if (!changed) return false;

    if (episode.surgeryId) {
      await Surgery.update(
        { status: 'completed', recoveryDaysRemaining: 0, dischargeDate: today },
        { where: { id: episode.surgeryId }, transaction }
      );
    }

    if (upcoming.length) {
      await Appointment.update(
        { status: 'cancelled' },
        { where: { id: upcoming.map((item) => item.id) }, transaction }
      );
    }

    if (openThreads.length) {
      await ChatThread.update(
        { status: 'closed', closedAt: new Date() },
        { where: { id: openThreads.map((item) => item.id) }, transaction }
      );
    }

    await SOSAlert.update(
      { status: 'resolved' },
      { where: { doctorId, patientId, status: 'acknowledged' }, transaction }
    );

    return true;
  });

  if (!won) return false;

  notifyPatientAndDoctor(io, patientId, doctorId, 'care_episode_completed', {
    careEpisodeId: episodeId,
    patientId,
  });

  upcoming.forEach((item) => {
    notifyPatientAndDoctor(io, patientId, doctorId, 'appointment_cancelled', {
      appointment: { ...item.toJSON(), status: 'cancelled' },
    });
  });

  openThreads.forEach((thread) => {
    io?.to(`thread_${thread.id}`).emit('chat_closed', { threadId: thread.id });
    notifyUser(io, patientId, 'chat_closed', { threadId: thread.id });
  });

  return true;
}

/*
 * Completes every active recovery whose days have run out (optionally only
 * one doctor's). An unanswered SOS holds a recovery open: an emergency must
 * not be lost because the clock ran out, and the doctor can only
 * acknowledge alerts for an active recovery. It completes as soon as the
 * alert is acknowledged.
 */
async function completeElapsedEpisodes(io, where = {}) {
  const episodes = await CareEpisode.findAll({
    where: { status: 'active', ...where },
  });

  let completed = 0;

  for (const episode of episodes) {
    const total = Number(episode.expectedRecoveryDays);
    const { daysRemaining } = computeRecovery(episode.startDate, total);

    if (!(total > 0) || daysRemaining > 0) continue;

    const pendingSos = await SOSAlert.count({
      where: {
        doctorId: episode.doctorId,
        patientId: episode.patientId,
        status: { [Op.in]: ['pending', 'escalated_admin'] },
      },
    });

    if (pendingSos > 0) continue;

    if (await completeEpisode(episode, io)) completed += 1;
  }

  return completed;
}

module.exports = { completeEpisode, completeElapsedEpisodes };
