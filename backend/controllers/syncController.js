const Schedule = require('../models/Schedule');
const { addReminderJob, removeReminderJob } = require('../queue/reminderQueue');

/**
 * POST /api/sync
 * Sinkronisasi data antara client (IndexedDB) dan server
 * Strategi: Last Write Wins berdasarkan updated_at
 */
const sync = async (req, res) => {
  try {
    const { last_sync, changes = [] } = req.body;
    const userId = req.user._id;
    const serverChanges = [];
    const errors = [];

    // 1. Proses perubahan dari client ke server
    for (const change of changes) {
      try {
        const clientData = { ...change };
        delete clientData._id;
        delete clientData.user_id;

        if (!change._id) {
          // CREATE: data baru dari client
          const schedule = await Schedule.create({
            ...clientData,
            user_id: userId,
            version: 1,
          });

          // Enqueue reminders
          for (const reminder of schedule.reminders || []) {
            if (!reminder.is_sent) {
              const job = await addReminderJob(
                schedule._id.toString(),
                reminder._id.toString(),
                userId.toString(),
                reminder.remind_at
              );
              if (job) reminder.job_id = job.id;
            }
          }
          await schedule.save();
          serverChanges.push({ action: 'created', data: schedule });
        } else {
          // UPDATE or DELETE: bandingkan timestamp
          const serverSchedule = await Schedule.findOne({
            _id: change._id,
            user_id: userId,
          });

          if (!serverSchedule) {
            // Server tidak punya, buat baru
            const newSchedule = await Schedule.create({
              _id: change._id,
              ...clientData,
              user_id: userId,
            });
            serverChanges.push({ action: 'created', data: newSchedule });
            continue;
          }

          const clientTime = new Date(change.updated_at || 0).getTime();
          const serverTime = new Date(serverSchedule.updated_at).getTime();

          if (clientTime > serverTime) {
            // Client lebih baru → update server
            // Hapus job lama jika schedule berubah
            if (change.is_deleted) {
              for (const r of serverSchedule.reminders) {
                if (r.job_id) await removeReminderJob(r.job_id);
              }
              serverSchedule.set({ ...clientData, is_deleted: true, version: serverSchedule.version + 1 });
            } else {
              serverSchedule.set({ ...clientData, version: serverSchedule.version + 1 });
            }
            await serverSchedule.save();
            serverChanges.push({ action: 'updated', data: serverSchedule });
          } else {
            // Server lebih baru → kirim balik ke client
            serverChanges.push({ action: 'server_win', data: serverSchedule });
          }
        }
      } catch (err) {
        console.error('Sync error for item:', change._id, err.message);
        errors.push({ id: change._id, error: err.message });
      }
    }

    // 2. Ambil perubahan server sejak last_sync
    const sinceDate = last_sync ? new Date(last_sync) : new Date(0);
    const serverUpdates = await Schedule.find({
      user_id: userId,
      updated_at: { $gt: sinceDate },
    });

    // Tambah ke server_changes yang belum ada
    const existingIds = new Set(serverChanges.map((c) => c.data._id.toString()));
    for (const s of serverUpdates) {
      if (!existingIds.has(s._id.toString())) {
        serverChanges.push({ action: 'server_update', data: s });
      }
    }

    res.json({
      success: true,
      server_changes: serverChanges,
      errors: errors.length ? errors : undefined,
      sync_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ success: false, message: 'Sync gagal' });
  }
};

module.exports = { sync };
