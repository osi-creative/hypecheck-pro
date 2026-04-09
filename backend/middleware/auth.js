const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'User tidak ditemukan' });
    }

    if (user.is_suspended) {
      return res.status(403).json({ success: false, message: 'Akun Anda telah disuspend' });
    }

    if (user.role !== 'owner' && user.expires_at < new Date()) {
      return res.status(403).json({ success: false, message: 'Masa aktif akun Anda telah habis' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Token tidak valid' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token telah kadaluarsa' });
    }
    next(error);
  }
};

const requireOwner = (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ success: false, message: 'Akses ditolak: hanya untuk Owner' });
  }
  next();
};

module.exports = { authenticate, requireOwner };
