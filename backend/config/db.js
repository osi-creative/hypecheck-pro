const mongoose = require('mongoose');

let isConnected = false;
let memoryServer = null;

const connectDB = async () => {
  if (isConnected) return;

  let uri = process.env.MONGO_URI || 'mongodb://localhost:27017/schedule_pro';

  try {
    await mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
    await seedOwner();
  } catch (error) {
    console.error('❌ Atlas Connection Error:', error.message);
    console.log('⚠️  MongoDB Atlas gagal tersambung, menggunakan in-memory database...');
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      uri = memoryServer.getUri();

      await mongoose.connect(uri, { maxPoolSize: 10 });
      isConnected = true;
      console.log('✅ MongoDB In-Memory Connected (data tidak persisten antar restart)');
      await seedOwner();
    } catch (fallbackError) {
      console.error('❌ Gagal koneksi MongoDB:', fallbackError.message);
      console.log('⚠️  Retrying in 5 seconds...');
      setTimeout(connectDB, 5000);
    }
  }
};

const seedOwner = async () => {
  try {
    const User = require('../models/User');
    const RegistrationCode = require('../models/RegistrationCode');
    const bcrypt = require('bcryptjs');

    const ownerExists = await User.findOne({ role: 'owner' });
    if (ownerExists) return;

    console.log('🌱 Seeding owner account...');

    const hashedPassword = await bcrypt.hash(
      process.env.OWNER_PASSWORD || 'Admin@Schedule123',
      12
    );

    const owner = await User.create({
      username: process.env.OWNER_USERNAME || 'admin',
      password: hashedPassword,
      name: process.env.OWNER_NAME || 'Administrator',
      phone: process.env.OWNER_PHONE || '628123456789',
      role: 'owner',
      theme: 'dark',
    });

    // Buat kode registrasi awal
    await RegistrationCode.create({
      code: 'SCHEDULE2024',
      is_used: false,
      usage_count: 0,
      max_usage: 100,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });

    console.log(`✅ Owner created: ${owner.username}`);
    console.log('✅ Default registration code: SCHEDULE2024');
  } catch (error) {
    if (error.code !== 11000) {
      console.error('❌ Seed error:', error.message);
    }
  }
};

module.exports = connectDB;
