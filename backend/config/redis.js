const Redis = require('ioredis');

let redisInstance = null;

const createRedisConnection = (options = {}) => {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  const redis = new Redis(url, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy: (times) => {
      if (times > 3) {
        return null; // Berhenti mencoba jika gagal 3 kali
      }
      return Math.min(times * 500, 2000);
    },
    ...options,
  });

  redis.on('connect', () => console.log('✅ Redis Connected'));
  redis.on('error', (err) => {
    // Silenced error logging
  });

  return redis;
};

// Singleton untuk koneksi umum
const getRedis = () => {
  if (!redisInstance) {
    redisInstance = createRedisConnection();
  }
  return redisInstance;
};

module.exports = { getRedis, createRedisConnection };
