const mongoose = require('mongoose');

const registrationCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    is_used: {
      type: Boolean,
      default: false,
    },
    usage_count: {
      type: Number,
      default: 0,
    },
    max_usage: {
      type: Number,
      default: 1,
    },
    expires_at: {
      type: Date,
      required: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    note: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: { createdAt: 'created_at' },
  }
);

// Virtual: apakah kode masih valid
registrationCodeSchema.virtual('is_valid').get(function () {
  return (
    !this.is_used &&
    this.usage_count < this.max_usage &&
    this.expires_at > new Date()
  );
});

module.exports = mongoose.model('RegistrationCode', registrationCodeSchema);
