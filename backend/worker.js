require('dotenv').config();
const { Worker } = require('bullmq');
const { createRedisConnection } = require('./config/redis');
const connectDB = require('./config/db');
const Schedule = require('./models/Schedule');
const User = require('./models/User');
const { sendWhatsApp, sendPushNotification, formatReminderMessage } = require('./services/notificationService');
const { addReminderJob } = require('./queue/reminderQueue');
const { getNextOccurrence } = require('./services/repeatService');

const processReminder = async (job) => {
  const { schedule_id, reminder_id, user_id } = job.data;
  console.log(`\n⚙️  Processing job: ${job.id} | Schedule: ${schedule_id} | Reminder: ${reminder_id}`);

  // ─── Anti-Zombie Checks ───────────────────────────────────
  const schedule = await Schedule.findById(schedule_id);
  if (!schedule) {
    console.log('⏭️  Schedule tidak ditemukan, skip');
    return { skipped: true, reason: 'schedule_not_found' };
  }
  if (schedule.is_deleted) {
    console.log('⏭️  Schedule dihapus, skip');
    return { skipped: true, reason: 'schedule_deleted' };
  }
  if (schedule.status === 'completed') {
    console.log('⏭️  Schedule sudah selesai, skip');
    return { skipped: true, reason: 'schedule_completed' };
  }

  const reminder = schedule.reminders.id(reminder_id);
  if (!reminder) {
    console.log('⏭️  Reminder tidak ditemukan, skip');
    return { skipped: true, reason: 'reminder_not_found' };
  }
  if (reminder.is_sent) {
    console.log('⏭️  Reminder sudah terkirim, skip');
    return { skipped: true, reason: 'already_sent' };
  }

  // ─── Ambil User ───────────────────────────────────────────
  const user = await User.findById(user_id);
  if (!user || user.is_suspended) {
    console.log('⏭️  User tidak aktif, skip');
    return { skipped: true, reason: 'user_inactive' };
  }

  // ─── Kirim Notifikasi ─────────────────────────────────────
  const message = formatReminderMessage(schedule);
  let waResult = { success: false };
  let pushResult = { success: false };

  // WhatsApp (utama)
  if (user.phone) {
    waResult = await sendWhatsApp(user.phone, message);
    console.log(`📱 WA Result:`, waResult.success ? '✅ Sent' : `❌ ${waResult.error}`);
  }

  // Web Push (backup jika WA gagal)
  if (!waResult.success && user.push_subscription) {
    pushResult = await sendPushNotification(user.push_subscription, {
      title: `🔔 ${schedule.title}`,
      body: `Deadline: ${new Date(schedule.deadline).toLocaleDateString('id-ID')}`,
      icon: '/icons/icon-192.png',
    });
    console.log(`🔔 Push Result:`, pushResult.success ? '✅ Sent' : `❌ ${pushResult.error}`);
  }

  // ─── Update Status Reminder ───────────────────────────────
  const delivered = waResult.success || pushResult.success;

  reminder.is_sent = delivered;
  reminder.retry_count = job.attemptsMade;
  if (!reminder.delivery_log) reminder.delivery_log = [];

  if (user.phone) {
    reminder.delivery_log.push({
      type: 'whatsapp',
      status: waResult.success ? 'sent' : 'failed',
      sent_at: new Date(),
      error: waResult.error,
    });
  }
  if (!waResult.success && user.push_subscription) {
    reminder.delivery_log.push({
      type: 'push',
      status: pushResult.success ? 'sent' : 'failed',
      sent_at: new Date(),
      error: pushResult.error,
    });
  }

  await schedule.save();

  // ─── Generate Next Reminder (jika repeat) ─────────────────
  if (delivered && schedule.repeat?.enabled) {
    const currentRule = schedule.repeat.rules.find(
      (r) => r._id.toString() === reminder._id?.toString()
    );

    // Cari rule berdasarkan waktu/hari yang cocok (nearest match)
    for (const rule of schedule.repeat.rules) {
      const nextDate = getNextOccurrence(rule.day, rule.time, new Date());
      if (nextDate) {
        // Cek apakah reminder untuk next date sudah ada
        const alreadyExists = schedule.reminders.some(
          (r) => !r.is_sent && Math.abs(new Date(r.remind_at) - nextDate) < 60000
        );

        if (!alreadyExists) {
          const newReminder = schedule.reminders.create({
            remind_at: nextDate,
            is_sent: false,
            retry_count: 0,
          });
          schedule.reminders.push(newReminder);
          await schedule.save();

          await addReminderJob(
            schedule._id.toString(),
            newReminder._id.toString(),
            user_id.toString(),
            nextDate
          );

          console.log(`🔁 Next reminder queued for ${rule.day} ${rule.time}: ${nextDate}`);
        }
      }
    }
  }

  if (!delivered) {
    throw new Error(`Delivery failed: WA=${waResult.error}, Push=${pushResult.error}`);
  }

  return { success: true, waResult, pushResult };
};

// ─── Start Worker ─────────────────────────────────────────
const startWorker = async () => {
  await connectDB();

  const connection = createRedisConnection({ maxRetriesPerRequest: null });

  const worker = new Worker('reminders', processReminder, {
    connection,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 }, // Max 10 job/detik
  });

  worker.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} completed`, result?.skipped ? `(${result.reason})` : '');
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  });

  worker.on('error', (err) => {
    console.error('Worker error:', err);
  });

  console.log('\n🔧 Schedule Pro Worker Started');
  console.log('   Queue  : reminders');
  console.log('   Concur : 5\n');
};

startWorker().catch(console.error);
