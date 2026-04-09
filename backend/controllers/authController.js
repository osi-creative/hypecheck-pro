const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const User = require('../models/User');
const RegistrationCode = require('../models/RegistrationCode');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// --- Validasi Schema ---
const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().min(2).max(100).required(),
  phone: Joi.string().pattern(/^[0-9]+$/).min(9).max(15).required(),
  code: Joi.string().required(),
});

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

// POST /api/register
const register = async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const { username, password, name, phone, code } = value;

    // Cek apakah username sudah ada
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Username sudah digunakan' });
    }

    // Validasi kode registrasi
    const regCode = await RegistrationCode.findOne({ code: code.toUpperCase() });
    if (!regCode) {
      return res.status(400).json({ success: false, message: 'Kode registrasi tidak valid' });
    }
    if (regCode.usage_count >= regCode.max_usage) {
      return res.status(400).json({ success: false, message: 'Kode registrasi sudah mencapai batas penggunaan' });
    }
    if (regCode.expires_at < new Date()) {
      return res.status(400).json({ success: false, message: 'Kode registrasi telah kadaluarsa' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Buat user
    const user = await User.create({
      username: username.toLowerCase(),
      password: hashedPassword,
      name,
      phone,
      role: 'user',
    });

    // Update usage kode
    await RegistrationCode.findByIdAndUpdate(regCode._id, {
      $inc: { usage_count: 1 },
      $set: { is_used: regCode.usage_count + 1 >= regCode.max_usage },
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Registrasi berhasil',
      data: { user, token },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/login
const login = async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const { username, password } = value;

    const user = await User.findOne({ username: username.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    if (user.is_suspended) {
      return res.status(403).json({ success: false, message: 'Akun Anda telah disuspend. Hubungi administrator.' });
    }

    if (user.role !== 'owner' && user.expires_at < new Date()) {
      return res.status(403).json({ success: false, message: 'Masa aktif akun Anda telah habis. Hubungi administrator.' });
    }

    const token = generateToken(user._id);
    const userObj = user.toJSON();

    res.json({
      success: true,
      message: 'Login berhasil',
      data: { user: userObj, token },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/me
const getMe = async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
};

// PUT /api/me/theme
const updateTheme = async (req, res) => {
  try {
    const { theme } = req.body;
    if (!['light', 'dark'].includes(theme)) {
      return res.status(400).json({ success: false, message: 'Theme tidak valid' });
    }
    const user = await User.findByIdAndUpdate(req.user._id, { theme }, { new: true });
    res.json({ success: true, data: { user } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PUT /api/me/push-subscription
const updatePushSubscription = async (req, res) => {
  try {
    const { subscription } = req.body;
    await User.findByIdAndUpdate(req.user._id, { push_subscription: subscription });
    res.json({ success: true, message: 'Push subscription updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { register, login, getMe, updateTheme, updatePushSubscription };
