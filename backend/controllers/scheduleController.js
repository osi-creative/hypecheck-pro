const Joi = require('joi');
const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const { addReminderJob, removeReminderJob } = require('../queue/reminderQueue');
const { generateInitialReminders } = require('../services/repeatService');

// Validasi schema
const reminderInputSchema = Joi.object({
  remind_at: Joi.date().iso().required(),
});

const scheduleSchema = Joi.object({
  title: Joi.string().min(1).max(200).required(),
  description: Joi.string().max(1000).allow('').default(''),
  deadline: Joi.date().iso().required(),
  status: Joi.string().valid('not_started', 'in_progress', 'completed').default('not_started'),
  repeat: Joi.object({
    enabled: Joi.boolean().default(false),
    rules: Joi.array().items(
      Joi.object({
        day: Joi.string()
          .valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
          .required(),
        time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
      })
    ).default([]),
  }).default({ enabled: false, rules: [] }),
  reminders: Joi.array().items(reminderInputSchema).default([]),
});

// GET /api/schedules
const getSchedules = async (req, res) => {
  try {
    const { since } = req.query;
    const query = { user_id: req.user._id, is_deleted: false };

    if (since) {
      query.updated_at = { $gte: new Date(since) };
    }

    const schedules = await Schedule.find(query).sort({ deadline: 1 });
    res.json({ success: true, data: schedules });
  } catch (error) {
    console.error('getSchedules error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/schedules
const createSchedule = async (req, res) => {
  try {
    const { error, value } = scheduleSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    // Build reminders list
    let remindersData = [];

    // Dari input manual
    if (value.reminders?.length) {
      remindersData = value.reminders.map((r) => ({
        remind_at: r.remind_at,
        is_sent: false,
        retry_count: 0,
      }));
    }

    // Dari repeat rules
    if (value.repeat?.enabled) {
      const repeatReminders = generateInitialReminders(value.repeat);
      remindersData = [...remindersData, ...repeatReminders];
    }

    const schedule = await Schedule.create({
      ...value,
      user_id: req.user._id,
      reminders: remindersData,
    });

    // Enqueue semua reminder jobs
    for (const reminder of schedule.reminders) {
      const job = await addReminderJob(
        schedule._id.toString(),
        reminder._id.toString(),
        req.user._id.toString(),
        reminder.remind_at
      );
      if (job) {
        reminder.job_id = job.id;
      }
    }
    await schedule.save();

    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    console.error('createSchedule error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PUT /api/schedules/:id
const updateSchedule = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'ID tidak valid' });
    }

    const schedule = await Schedule.findOne({
      _id: req.params.id,
      user_id: req.user._id,
      is_deleted: false,
    });

    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule tidak ditemukan' });
    }

    const { error, value } = scheduleSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    // Hapus semua job lama
    for (const reminder of schedule.reminders) {
      if (reminder.job_id) {
        await removeReminderJob(reminder.job_id);
      }
    }

    // Build reminders baru
    let remindersData = [];
    if (value.reminders?.length) {
      remindersData = value.reminders.map((r) => ({
        remind_at: r.remind_at,
        is_sent: false,
        retry_count: 0,
      }));
    }
    if (value.repeat?.enabled) {
      const repeatReminders = generateInitialReminders(value.repeat);
      remindersData = [...remindersData, ...repeatReminders];
    }

    // Update schedule
    schedule.set({
      ...value,
      reminders: remindersData,
      version: schedule.version + 1,
    });
    await schedule.save();

    // Enqueue jobs baru
    for (const reminder of schedule.reminders) {
      if (!reminder.is_sent) {
        const job = await addReminderJob(
          schedule._id.toString(),
          reminder._id.toString(),
          req.user._id.toString(),
          reminder.remind_at
        );
        if (job) reminder.job_id = job.id;
      }
    }
    await schedule.save();

    res.json({ success: true, data: schedule });
  } catch (error) {
    console.error('updateSchedule error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// DELETE /api/schedules/:id (soft delete)
const deleteSchedule = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'ID tidak valid' });
    }

    const schedule = await Schedule.findOne({
      _id: req.params.id,
      user_id: req.user._id,
      is_deleted: false,
    });

    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule tidak ditemukan' });
    }

    // Hapus semua pending jobs
    for (const reminder of schedule.reminders) {
      if (reminder.job_id && !reminder.is_sent) {
        await removeReminderJob(reminder.job_id);
      }
    }

    // Soft delete
    schedule.is_deleted = true;
    schedule.version += 1;
    await schedule.save();

    res.json({ success: true, message: 'Schedule dihapus' });
  } catch (error) {
    console.error('deleteSchedule error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getSchedules, createSchedule, updateSchedule, deleteSchedule };
