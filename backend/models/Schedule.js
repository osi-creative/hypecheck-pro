const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  remind_at: { type: Date, required: true },
  is_sent: { type: Boolean, default: false },
  retry_count: { type: Number, default: 0 },
  job_id: { type: String, default: null },
  delivery_log: [
    {
      type: { type: String, enum: ['whatsapp', 'push'], default: 'whatsapp' },
      status: { type: String, enum: ['sent', 'failed', 'pending'], default: 'pending' },
      sent_at: { type: Date },
      error: { type: String },
    },
  ],
});

const repeatRuleSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    required: true,
  },
  time: {
    type: String, // Format "HH:MM"
    required: true,
    match: /^([01]\d|2[0-3]):([0-5]\d)$/,
  },
});

const scheduleSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    deadline: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
    },
    repeat: {
      enabled: { type: Boolean, default: false },
      rules: [repeatRuleSchema],
    },
    reminders: [reminderSchema],
    is_deleted: {
      type: Boolean,
      default: false,
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Index untuk query efisien
scheduleSchema.index({ user_id: 1, is_deleted: 1 });
scheduleSchema.index({ user_id: 1, updated_at: -1 });
scheduleSchema.index({ 'reminders.remind_at': 1, 'reminders.is_sent': 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);
