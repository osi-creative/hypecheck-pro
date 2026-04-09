/**
 * db.js — IndexedDB wrapper menggunakan Dexie.js (dimuat via CDN)
 * Digunakan oleh app.js untuk operasi offline-first
 */

class ScheduleDB {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    // Tunggu Dexie tersedia
    if (typeof Dexie === 'undefined') {
      throw new Error('Dexie.js belum dimuat');
    }

    this.db = new Dexie('ScheduleProDB');

    this.db.version(1).stores({
      schedules: '_id, user_id, status, deadline, updated_at, is_deleted, is_synced',
      pendingSync: '_id, type, timestamp',
      settings: 'key',
    });

    await this.db.open();
    return this.db;
  }

  // ─── Settings ───────────────────────────────────────────
  async getSetting(key) {
    await this.init();
    const item = await this.db.settings.get(key);
    return item?.value ?? null;
  }

  async setSetting(key, value) {
    await this.init();
    await this.db.settings.put({ key, value });
  }

  // ─── Schedules ──────────────────────────────────────────
  async getAllSchedules() {
    await this.init();
    return this.db.schedules
      .where('is_deleted')
      .equals(0)
      .toArray()
      .then((rows) => rows.sort((a, b) => new Date(a.deadline) - new Date(b.deadline)));
  }

  async getScheduleById(id) {
    await this.init();
    return this.db.schedules.get(id);
  }

  async saveSchedule(schedule) {
    await this.init();
    const data = {
      ...schedule,
      _id: schedule._id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      is_deleted: schedule.is_deleted ? 1 : 0,
      is_synced: schedule.is_synced ?? 0,
      updated_at: schedule.updated_at || new Date().toISOString(),
    };
    await this.db.schedules.put(data);
    return data;
  }

  async softDeleteSchedule(id) {
    await this.init();
    await this.db.schedules.update(id, {
      is_deleted: 1,
      is_synced: 0,
      updated_at: new Date().toISOString(),
    });
  }

  async markSynced(id) {
    await this.init();
    await this.db.schedules.update(id, { is_synced: 1 });
  }

  async getUnsyncedSchedules() {
    await this.init();
    return this.db.schedules.where('is_synced').equals(0).toArray();
  }

  async bulkSaveSchedules(schedules) {
    await this.init();
    const items = schedules.map((s) => ({
      ...s,
      is_deleted: s.is_deleted ? 1 : 0,
      is_synced: 1,
    }));
    await this.db.schedules.bulkPut(items);
  }

  // ─── Clear All (logout) ─────────────────────────────────
  async clearAll() {
    await this.init();
    await this.db.schedules.clear();
    await this.db.pendingSync.clear();
    await this.db.settings.clear();
  }
}

// Singleton
const localDB = new ScheduleDB();
