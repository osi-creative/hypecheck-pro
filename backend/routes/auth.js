const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { register, login, getMe, updateTheme, updatePushSubscription } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 10,
  message: { success: false, message: 'Terlalu banyak percobaan, coba lagi dalam 15 menit' },
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', authenticate, getMe);
router.put('/me/theme', authenticate, updateTheme);
router.put('/me/push-subscription', authenticate, updatePushSubscription);

module.exports = router;
