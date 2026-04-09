const Joi = require('joi');
const crypto = require('crypto');
const User = require('../models/User');
const RegistrationCode = require('../models/RegistrationCode');

// POST /api/generate-code
const generateCode = async (req, res) => {
  try {
    const schema = Joi.object({
      max_usage: Joi.number().integer().min(1).max(1000).default(1),
      expires_days: Joi.number().integer().min(1).max(365).default(30),
      note: Joi.string().max(200).allow('').default(''),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + value.expires_days * 24 * 60 * 60 * 1000);

    const regCode = await RegistrationCode.create({
      code,
      max_usage: value.max_usage,
      expires_at: expiresAt,
      created_by: req.user._id,
      note: value.note,
    });

    res.status(201).json({
      success: true,
      data: regCode,
      message: `Kode registrasi berhasil dibuat: ${code}`,
    });
  } catch (error) {
    console.error('generateCode error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/registration-codes
const getCodes = async (req, res) => {
  try {
    const codes = await RegistrationCode.find()
      .populate('created_by', 'name username')
      .sort({ created_at: -1 });
    res.json({ success: true, data: codes });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/users
const getUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }).sort({ created_at: -1 });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PUT /api/users/:id/suspend
const suspendUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
    if (user.role === 'owner') {
      return res.status(403).json({ success: false, message: 'Tidak dapat suspend owner' });
    }

    user.is_suspended = !user.is_suspended;
    await user.save();

    res.json({
      success: true,
      message: user.is_suspended ? 'User disuspend' : 'Suspend dicabut',
      data: user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PUT /api/users/:id/extend
const extendUser = async (req, res) => {
  try {
    const { days = 30 } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }

    const now = new Date();
    const currentExpiry = user.expires_at > now ? user.expires_at : now;
    user.expires_at = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);
    await user.save();

    res.json({ success: true, message: `Masa aktif diperpanjang ${days} hari`, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { generateCode, getCodes, getUsers, suspendUser, extendUser };
