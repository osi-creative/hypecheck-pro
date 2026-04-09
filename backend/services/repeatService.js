/**
 * Repeat Service
 * Generate reminder berikutnya berdasarkan repeat.rules
 */

const DAY_MAP = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Hitung tanggal reminder berikutnya berdasarkan rule
 * @param {string} day - nama hari (monday, tuesday, dst)
 * @param {string} time - waktu "HH:MM"
 * @param {Date} fromDate - mulai dari tanggal ini
 * @returns {Date}
 */
const getNextOccurrence = (day, time, fromDate = new Date()) => {
  const targetDay = DAY_MAP[day.toLowerCase()];
  if (targetDay === undefined) return null;

  const [hours, minutes] = time.split(':').map(Number);
  const now = new Date(fromDate);

  // Cari hari berikutnya yang cocok
  let daysAhead = targetDay - now.getDay();
  if (daysAhead < 0 || (daysAhead === 0 && now.getHours() * 60 + now.getMinutes() >= hours * 60 + minutes)) {
    daysAhead += 7;
  }
  if (daysAhead === 0) daysAhead = 7; // Minimal minggu depan

  const next = new Date(now);
  next.setDate(now.getDate() + daysAhead);
  next.setHours(hours, minutes, 0, 0);

  return next;
};

/**
 * Generate semua reminder berikutnya dari semua rules
 * @param {Object} repeat - { enabled, rules: [{day, time}] }
 * @param {Date} fromDate
 * @returns {Array<{day, time, remind_at}>}
 */
const generateNextReminders = (repeat, fromDate = new Date()) => {
  if (!repeat?.enabled || !repeat.rules?.length) return [];

  return repeat.rules
    .map((rule) => ({
      day: rule.day,
      time: rule.time,
      remind_at: getNextOccurrence(rule.day, rule.time, fromDate),
    }))
    .filter((r) => r.remind_at !== null)
    .sort((a, b) => a.remind_at - b.remind_at);
};

/**
 * Generate reminder pertama kali dari semua rules (saat buat schedule)
 * @param {Object} repeat
 * @returns {Array<Date>}
 */
const generateInitialReminders = (repeat) => {
  return generateNextReminders(repeat).map((r) => ({
    remind_at: r.remind_at,
    is_sent: false,
    retry_count: 0,
    job_id: null,
  }));
};

module.exports = { getNextOccurrence, generateNextReminders, generateInitialReminders };
