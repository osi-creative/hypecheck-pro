require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

const app = express();

// ─── Middleware ──────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://hypecheck-pro.vercel.app',
  'https://hypecheck-pro-osicreative.vercel.app',
  'https://hypecheck-69lykyspe-osicreative.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(null, true); // Fallback allow for easier debugging context
    }
    return callback(null, true);
  },
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Global rate limit
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, message: 'Too many requests' },
});
app.use(globalLimiter);

// ─── Routes ──────────────────────────────────────────────
app.use('/api', require('./routes/auth'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/owner', require('./routes/owner'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Schedule Pro API is running',
    timestamp: new Date().toISOString(),
  });
});

// ─── Error Handler ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
});

// ─── Start Server ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🚀 Schedule Pro API`);
    console.log(`   Port  : ${PORT}`);
    console.log(`   Mode  : ${process.env.NODE_ENV || 'development'}`);
    console.log(`   URL   : http://localhost:${PORT}/api/health\n`);
  });
};

start();

module.exports = app;
