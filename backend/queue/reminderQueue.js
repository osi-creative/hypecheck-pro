const { Queue } = require('bullmq');
const { createRedisConnection } = require('../config/redis');

let reminderQueue = null;

const getReminderQueue = () => {
  if (!reminderQueue) {
    const connection = createRedisConnection({ maxRetriesPerRequest: null });
    reminderQueue = new Queue('reminders', {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 60000, // 1 menit
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
    console.log('✅ Reminder Queue initialized');
  }
  return reminderQueue;
};

/**
 * Tambah job reminder ke queue
 * @param {string} scheduleId
 * @param {string} reminderId
 * @param {string} userId
 * @param {Date} remindAt
 */
const addReminderJob = async (scheduleId, reminderId, userId, remindAt) => {
  try {
    const queue = getReminderQueue();
    const delay = new Date(remindAt).getTime() - Date.now();

    if (delay < 0) {
      console.log(`⏭️  Skipping past reminder: ${reminderId}`);
      return null;
    }

    const job = await queue.add(
      'send-reminder',
      { schedule_id: scheduleId, reminder_id: reminderId, user_id: userId },
      {
        jobId: reminderId.toString(),
        delay: Math.max(delay, 1000), // min 1 detik
      }
    );

    console.log(`📅 Job queued: ${job.id}, delay: ${Math.round(delay / 1000)}s`);
    return job;
  } catch (error) {
    console.error('❌ Failed to add reminder job:', error.message);
    return null;
  }
};

/**
 * Hapus job reminder dari queue
 * @param {string} jobId
 */
const removeReminderJob = async (jobId) => {
  try {
    const queue = getReminderQueue();
    const job = await queue.getJob(jobId.toString());
    if (job) {
      await job.remove();
      console.log(`🗑️  Job removed: ${jobId}`);
    }
  } catch (error) {
    console.error('❌ Failed to remove job:', error.message);
  }
};

module.exports = { getReminderQueue, addReminderJob, removeReminderJob };
