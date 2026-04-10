/**
 * app.js — Schedule Pro Frontend Logic
 * SPA dengan auth, CRUD jadwal, sync, dan owner panel
 */

// Alamat API (Ubah komentar di bawah untuk pindah antara lokal dan Render Cloud)
// const API_BASE = 'http://localhost:3000/api';
const API_BASE = 'https://hypecheck-pro.onrender.com/api';

// ─── State ───────────────────────────────────────────────────
const State = {
  token: localStorage.getItem('sp_token') || null,
  user: JSON.parse(localStorage.getItem('sp_user') || 'null'),
  schedules: [],
  currentFilter: 'all',
  editingScheduleId: null,
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSync: localStorage.getItem('sp_last_sync') || null,
};

// ─── API Helper ───────────────────────────────────────────────
const api = async (path, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...(State.token ? { Authorization: `Bearer ${State.token}` } : {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Error ${res.status}`);
  }
  return data;
};

// ─── Toast ────────────────────────────────────────────────────
const toast = (message, type = 'info', duration = 3000) => {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${message}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, duration);
};

// ─── Sync Status Bar ──────────────────────────────────────────
const setSyncStatus = (status, message) => {
  const bar = document.getElementById('sync-bar');
  const icon = document.getElementById('sync-bar-icon');
  const text = document.getElementById('sync-bar-text');

  bar.className = `${status} visible`;
  text.textContent = message;

  const spinners = { syncing: '⟳', synced: '✓', error: '✗', offline: '⚠' };
  icon.textContent = spinners[status] || '•';

  if (status !== 'syncing') {
    setTimeout(() => bar.classList.remove('visible'), 3000);
  }
};

// ─── Date Helpers ─────────────────────────────────────────────
const formatDate = (date) => {
  const d = new Date(date);
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const getDeadlineClass = (deadline) => {
  const diff = new Date(deadline) - Date.now();
  const hours = diff / 1000 / 60 / 60;
  if (diff < 0) return 'deadline-urgent';
  if (hours < 24) return 'deadline-urgent';
  if (hours < 72) return 'deadline-soon';
  return 'deadline-ok';
};

const toLocalDatetimeValue = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ─── Schedule Card Renderer ───────────────────────────────────
const renderScheduleCard = (schedule) => {
  const statusLabels = {
    not_started: 'Belum Mulai',
    in_progress: 'Dikerjakan',
    completed: 'Selesai',
  };

  const deadlineClass = getDeadlineClass(schedule.deadline);
  const reminderCount = (schedule.reminders || []).filter(r => !r.is_sent).length;
  const isRepeat = schedule.repeat?.enabled;

  const card = document.createElement('div');
  card.className = `schedule-card status-${schedule.status}`;
  card.dataset.id = schedule._id;
  card.innerHTML = `
    <div class="schedule-card-header">
      <div class="schedule-title">${escHtml(schedule.title)}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <div class="schedule-actions">
          <button class="btn-icon" onclick="App.openScheduleModal('${schedule._id}')" title="Edit">
            <i data-lucide="pencil"></i>
          </button>
          <button class="btn-icon btn-danger" onclick="App.deleteSchedule('${schedule._id}')" title="Hapus">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
        <span class="badge badge-${schedule.status}">${statusLabels[schedule.status]}</span>
      </div>
    </div>
    ${schedule.description ? `<div class="schedule-desc">${escHtml(schedule.description)}</div>` : ''}
    <div class="schedule-meta">
      <span class="schedule-meta-item ${deadlineClass}">
        <i data-lucide="clock"></i>
        ${formatDate(schedule.deadline)}
      </span>
      ${reminderCount > 0 ? `
        <span class="schedule-meta-item">
          <i data-lucide="bell"></i>
          ${reminderCount} pengingat
        </span>` : ''}
      ${isRepeat ? `
        <span class="schedule-meta-item" style="color:var(--accent-light);">
          <i data-lucide="repeat"></i>
          Berulang
        </span>` : ''}
      ${!schedule._id.startsWith('local_') || schedule.is_synced ? '' : `
        <span class="schedule-meta-item" style="color:var(--warning);">
          <i data-lucide="cloud-off"></i>
          Belum disimpan
        </span>`}
    </div>
  `;

  // Click anywhere on card to change status
  card.addEventListener('click', (e) => {
    if (e.target.closest('.schedule-actions') || e.target.closest('.btn-icon')) return;
    App.cycleStatus(schedule._id);
  });

  return card;
};

const escHtml = (str) => {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
};

// ─── Main App Object ──────────────────────────────────────────
const App = {
  // ─── Init ────────────────────────────────────────────────
  async init() {
    // Memaksa unregister Service Worker lama untuk membersihkan cache yang nyangkut
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
    }

    // Init icons
    lucide.createIcons();

    // Theme
    const theme = State.user?.theme || localStorage.getItem('sp_theme') || 'dark';
    this.applyTheme(theme);

    // Online/Offline handlers
    window.addEventListener('online', () => {
      State.isOnline = true;
      toast('Kembali online — menyinkronkan data...', 'success');
      this.syncNow();
    });
    window.addEventListener('offline', () => {
      State.isOnline = false;
      setSyncStatus('offline', 'Mode Offline');
    });

    if (State.token && State.user) {
      this.showApp();
    } else {
      this.showAuth();
    }
  },

  // ─── Auth ────────────────────────────────────────────────
  showAuth() {
    document.getElementById('auth-page').classList.add('active');
    document.getElementById('navbar').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    document.querySelectorAll('.page:not(#auth-page)').forEach(p => p.classList.remove('active'));
    lucide.createIcons();
  },

  showApp() {
    document.getElementById('auth-page').classList.remove('active');
    document.getElementById('navbar').style.display = 'flex';
    document.getElementById('bottom-nav').style.display = 'flex';
    
    // Resume last page instead of always picking dashboard
    const lastPage = localStorage.getItem('sp_current_page') || 'dashboard';
    this.navTo(lastPage);
    
    this.loadSchedules();
    // renderProfile already called by navTo if lastPage was profile
    if (State.isOnline) this.syncNow();
  },

  showAuthTab(tab) {
    document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  },

  async handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    try {
      const data = await api('/login', {
        method: 'POST',
        body: {
          username: document.getElementById('login-username').value.trim(),
          password: document.getElementById('login-password').value,
        },
      });

      State.token = data.data.token;
      State.user = data.data.user;
      localStorage.setItem('sp_token', State.token);
      localStorage.setItem('sp_user', JSON.stringify(State.user));

      toast('Login berhasil! Selamat datang 👋', 'success');
      e.target.reset(); // Reset form login
      this.showApp();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.innerHTML = '<span>Masuk</span>';
      btn.disabled = false;
    }
  },

  async handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('register-btn');
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    try {
      const data = await api('/register', {
        method: 'POST',
        body: {
          name: document.getElementById('reg-name').value.trim(),
          username: document.getElementById('reg-username').value.trim(),
          phone: document.getElementById('reg-phone').value.trim(),
          password: document.getElementById('reg-password').value,
          code: document.getElementById('reg-code').value.trim().toUpperCase(),
        },
      });

      State.token = data.data.token;
      State.user = data.data.user;
      localStorage.setItem('sp_token', State.token);
      localStorage.setItem('sp_user', JSON.stringify(State.user));

      toast('Registrasi berhasil! Selamat datang 🎉', 'success');
      e.target.reset(); // Reset form registrasi
      this.showApp();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.innerHTML = '<span>Daftar Sekarang</span>';
      btn.disabled = false;
    }
  },

  logout() {
    if (!confirm('Yakin ingin keluar?')) return;
    
    // Bersihkan state aplikasi
    State.token = null;
    State.user = null;
    State.schedules = [];
    
    // Bersihkan storage
    localStorage.removeItem('sp_token');
    localStorage.removeItem('sp_user');
    localStorage.removeItem('sp_last_sync');
    localStorage.removeItem('sp_current_page');
    
    // Bersihkan database lokal
    localDB.clearAll().catch(() => {});
    
    // Fungsi untuk membersihkan semua input form secara paksa
    const clearInputs = () => {
      const ids = [
        'login-username', 'login-password', 
        'reg-name', 'reg-username', 'reg-phone', 'reg-password', 'reg-code'
      ];
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.value = '';
          el.setAttribute('value', ''); 
        }
      });
      // Reset form secara keseluruhan
      document.getElementById('login-form')?.reset();
      document.getElementById('register-form')?.reset();
    };

    // Bersihkan sekarang
    clearInputs();
    
    // Pindah ke halaman auth
    this.showAuth();

    // Bersihkan lagi setelah sedikit delay (mengatasi browser autofill yang bandel)
    setTimeout(clearInputs, 100);
    
    toast('Berhasil keluar', 'info');
  },

  // ─── Navigation ──────────────────────────────────────────
  navTo(page) {
    const pages = ['dashboard', 'schedules', 'profile', 'owner'];
    const navItems = ['nav-dashboard', 'nav-schedules', 'nav-profile'];

    pages.forEach(p => {
      document.getElementById(`${p}-page`)?.classList.remove('active');
    });
    navItems.forEach(n => document.getElementById(n)?.classList.remove('active'));

    document.getElementById(`${page}-page`)?.classList.add('active');
    if (document.getElementById(`nav-${page}`)) {
      document.getElementById(`nav-${page}`).classList.add('active');
    }

    // Simpan halaman terakhir ke localStorage
    if (page !== 'owner' || State.user?.role === 'owner') {
      localStorage.setItem('sp_current_page', page);
    }

    // Load page data
    if (page === 'schedules') this.renderSchedulesList();
    if (page === 'profile') this.renderProfile();
    if (page === 'owner') { this.loadUserList(); this.loadCodeList(); }

    lucide.createIcons();
  },

  // ─── Theme ───────────────────────────────────────────────
  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const toggleProfile = document.getElementById('theme-toggle-profile');
    if (toggleProfile) toggleProfile.checked = (theme === 'dark');
    localStorage.setItem('sp_theme', theme);
  },

  async toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    this.applyTheme(next);

    if (State.token) {
      try {
        await api('/me/theme', { method: 'PUT', body: { theme: next } });
        State.user.theme = next;
        localStorage.setItem('sp_user', JSON.stringify(State.user));
      } catch (_) {}
    }
  },

  // ─── Schedules CRUD ──────────────────────────────────────
  async loadSchedules() {
    try {
      // Load dari IndexedDB dulu (offline-first)
      State.schedules = await localDB.getAllSchedules();
      this.renderDashboard();
      this.renderSchedulesList();

      // Lalu fetch dari server jika online
      if (State.isOnline) {
        const data = await api('/schedules');
        // Merge dengan local
        await localDB.bulkSaveSchedules(data.data);
        State.schedules = await localDB.getAllSchedules();
        this.renderDashboard();
        this.renderSchedulesList();
      }
    } catch (err) {
      console.error('loadSchedules error:', err);
      // Fallback ke local jika server gagal
      State.schedules = await localDB.getAllSchedules();
      this.renderDashboard();
    }
  },

  renderDashboard() {
    const schedules = State.schedules.filter(s => !s.is_deleted);
    document.getElementById('stat-total').textContent = schedules.length;
    document.getElementById('stat-inprogress').textContent = schedules.filter(s => s.status === 'in_progress').length;
    document.getElementById('stat-completed').textContent = schedules.filter(s => s.status === 'completed').length;

    const greeting = State.user?.name ? `Halo, ${State.user.name.split(' ')[0]}! 👋` : 'Selamat datang!';
    document.getElementById('dashboard-greeting').textContent = greeting;

    // Upcoming: belum selesai, urutkan deadline
    const upcoming = schedules
      .filter(s => s.status !== 'completed')
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
      .slice(0, 5);

    const container = document.getElementById('upcoming-list');
    if (upcoming.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎉</div>
          <h3>Semua beres!</h3>
          <p>Tidak ada jadwal yang perlu dikerjakan</p>
        </div>`;
    } else {
      container.innerHTML = '';
      upcoming.forEach(s => container.appendChild(renderScheduleCard(s)));
    }
    lucide.createIcons();
  },

  renderSchedulesList() {
    const filter = State.currentFilter;
    let schedules = State.schedules.filter(s => !s.is_deleted);
    if (filter !== 'all') schedules = schedules.filter(s => s.status === filter);
    schedules.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    const container = document.getElementById('schedules-list');
    if (schedules.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <h3>Tidak ada jadwal</h3>
          <p>${filter === 'all' ? 'Tambah jadwal baru untuk memulai' : 'Tidak ada jadwal dengan status ini'}</p>
        </div>`;
    } else {
      container.innerHTML = '';
      schedules.forEach(s => container.appendChild(renderScheduleCard(s)));
    }
    lucide.createIcons();
  },

  filterSchedules(status, btn) {
    State.currentFilter = status;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this.renderSchedulesList();
  },

  async cycleStatus(id) {
    const idx = State.schedules.findIndex(s => s._id === id);
    if (idx === -1) return;

    const current = State.schedules[idx].status;
    const next = { not_started: 'in_progress', in_progress: 'completed', completed: 'not_started' };
    const newStatus = next[current];

    State.schedules[idx].status = newStatus;
    State.schedules[idx].updated_at = new Date().toISOString();
    State.schedules[idx].is_synced = 0;

    // Update UI optimistically
    this.renderDashboard();
    this.renderSchedulesList();

    await localDB.saveSchedule(State.schedules[idx]);

    // Sync ke server jika online
    if (State.isOnline) {
      try {
        const s = State.schedules[idx];
        if (s._id.startsWith('local_')) {
          await this.syncNow();
        } else {
          await api(`/schedules/${s._id}`, { method: 'PUT', body: s });
          await localDB.markSynced(s._id);
        }
      } catch (_) {}
    }
  },

  // ─── Schedule Modal ───────────────────────────────────────
  openScheduleModal(editId = null) {
    State.editingScheduleId = editId;
    const modal = document.getElementById('schedule-modal');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('schedule-form');
    form.reset();

    // Reset reminder & repeat
    document.getElementById('reminders-list').innerHTML = '';
    document.getElementById('repeat-rules-list').innerHTML = '';
    document.getElementById('repeat-section').style.display = 'none';
    document.getElementById('s-repeat-toggle').checked = false;

    if (editId) {
      const s = State.schedules.find(x => x._id === editId);
      if (!s) return;
      title.textContent = 'Edit Jadwal';
      document.getElementById('s-title').value = s.title;
      document.getElementById('s-desc').value = s.description || '';
      document.getElementById('s-deadline').value = toLocalDatetimeValue(s.deadline);
      document.getElementById('s-status').value = s.status;

      // Reminders
      (s.reminders || []).filter(r => !r.is_sent).forEach(r => {
        this.addReminderInput(toLocalDatetimeValue(r.remind_at));
      });

      // Repeat
      if (s.repeat?.enabled) {
        document.getElementById('s-repeat-toggle').checked = true;
        document.getElementById('repeat-section').style.display = 'block';
        (s.repeat.rules || []).forEach(rule => {
          this.addRepeatRule(rule.day, rule.time);
        });
      }
    } else {
      title.textContent = 'Tambah Jadwal';
    }

    modal.classList.add('open');
    lucide.createIcons();
  },

  closeScheduleModal() {
    document.getElementById('schedule-modal').classList.remove('open');
    State.editingScheduleId = null;
  },

  addReminderInput(value = '') {
    const container = document.getElementById('reminders-list');
    const item = document.createElement('div');
    item.className = 'reminder-item';
    item.innerHTML = `
      <i data-lucide="bell" style="width:16px;height:16px;color:var(--text-muted);flex-shrink:0;"></i>
      <input type="datetime-local" class="reminder-input" value="${value}" />
      <button type="button" class="btn-icon" style="padding:4px;" onclick="this.parentElement.remove()">
        <i data-lucide="x"></i>
      </button>`;
    container.appendChild(item);
    lucide.createIcons();
  },

  toggleRepeat(checked) {
    document.getElementById('repeat-section').style.display = checked ? 'block' : 'none';
    if (checked && document.getElementById('repeat-rules-list').children.length === 0) {
      this.addRepeatRule();
    }
  },

  addRepeatRule(day = 'monday', time = '09:00') {
    const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const dayLabels = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];

    const container = document.getElementById('repeat-rules-list');
    const item = document.createElement('div');
    item.className = 'repeat-rule-item';
    item.innerHTML = `
      <i data-lucide="repeat" style="width:16px;height:16px;color:var(--text-muted);flex-shrink:0;"></i>
      <select class="rule-day">
        ${days.map((d, i) => `<option value="${d}" ${d === day ? 'selected' : ''}>${dayLabels[i]}</option>`).join('')}
      </select>
      <input type="time" class="rule-time" value="${time}" style="width:100px;" />
      <button type="button" class="btn-icon" style="padding:4px;" onclick="this.parentElement.remove()">
        <i data-lucide="x"></i>
      </button>`;
    container.appendChild(item);
    lucide.createIcons();
  },

  async handleScheduleSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('save-schedule-btn');
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    try {
      const title = document.getElementById('s-title').value.trim();
      const desc = document.getElementById('s-desc').value.trim();
      const deadline = document.getElementById('s-deadline').value;
      const status = document.getElementById('s-status').value;

      // Collect reminders
      const reminders = [];
      document.querySelectorAll('.reminder-input').forEach(input => {
        if (input.value) reminders.push({ remind_at: new Date(input.value).toISOString() });
      });

      // Collect repeat rules
      const repeatToggle = document.getElementById('s-repeat-toggle').checked;
      const rules = [];
      document.querySelectorAll('.repeat-rule-item').forEach(item => {
        const day = item.querySelector('.rule-day')?.value;
        const time = item.querySelector('.rule-time')?.value;
        if (day && time) rules.push({ day, time });
      });

      const payload = {
        title,
        description: desc,
        deadline: new Date(deadline).toISOString(),
        status,
        reminders,
        repeat: { enabled: repeatToggle && rules.length > 0, rules },
      };

      let savedSchedule;

      if (State.editingScheduleId && !State.editingScheduleId.startsWith('local_')) {
        // Update di server
        if (State.isOnline) {
          const res = await api(`/schedules/${State.editingScheduleId}`, { method: 'PUT', body: payload });
          savedSchedule = { ...res.data, is_synced: 1 };
        } else {
          savedSchedule = { ...payload, _id: State.editingScheduleId, updated_at: new Date().toISOString(), is_synced: 0 };
        }
      } else if (State.editingScheduleId?.startsWith('local_')) {
        savedSchedule = { ...payload, _id: State.editingScheduleId, updated_at: new Date().toISOString(), is_synced: 0 };
      } else {
        // Create
        if (State.isOnline) {
          const res = await api('/schedules', { method: 'POST', body: payload });
          savedSchedule = { ...res.data, is_synced: 1 };
        } else {
          savedSchedule = {
            ...payload,
            _id: `local_${Date.now()}`,
            user_id: State.user._id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_deleted: false,
            version: 1,
            is_synced: 0,
          };
        }
      }

      // Simpan ke IndexedDB
      await localDB.saveSchedule(savedSchedule);

      // Update state
      const idx = State.schedules.findIndex(s => s._id === savedSchedule._id);
      if (idx >= 0) State.schedules[idx] = savedSchedule;
      else State.schedules.push(savedSchedule);

      this.closeScheduleModal();
      this.renderDashboard();
      this.renderSchedulesList();
      toast(State.editingScheduleId ? 'Jadwal diperbarui ✅' : 'Jadwal ditambahkan ✅', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.innerHTML = '<span>Simpan</span>';
      btn.disabled = false;
    }
  },

  async deleteSchedule(id) {
    if (!confirm('Hapus jadwal ini?')) return;

    const idx = State.schedules.findIndex(s => s._id === id);
    if (idx === -1) return;

    // Soft delete local
    State.schedules[idx].is_deleted = 1;
    State.schedules[idx].updated_at = new Date().toISOString();
    State.schedules[idx].is_synced = 0;
    await localDB.softDeleteSchedule(id);

    // Update UI
    this.renderDashboard();
    this.renderSchedulesList();

    // Hapus di server jika online
    if (State.isOnline && !id.startsWith('local_')) {
      try {
        await api(`/schedules/${id}`, { method: 'DELETE' });
        State.schedules[idx].is_synced = 1;
        await localDB.markSynced(id);
      } catch (_) {}
    }

    toast('Jadwal dihapus', 'info');
  },

  // ─── Sync ─────────────────────────────────────────────────
  async syncNow() {
    if (!State.isOnline || State.isSyncing || !State.token) return;

    State.isSyncing = true;
    setSyncStatus('syncing', 'Menyinkronkan...');

    try {
      const unsyncedItems = await localDB.getUnsyncedSchedules();
      const changes = unsyncedItems.map(s => ({
        ...s,
        is_deleted: !!s.is_deleted,
      }));

      const res = await api('/sync', {
        method: 'POST',
        body: { last_sync: State.lastSync, changes },
      });

      // Terapkan perubahan server
      for (const change of res.server_changes || []) {
        if (change.data) {
          await localDB.saveSchedule({ ...change.data, is_synced: 1 });
        }
      }

      // Mark semua sebagai synced
      for (const item of unsyncedItems) {
        await localDB.markSynced(item._id);
      }

      State.lastSync = res.sync_at;
      localStorage.setItem('sp_last_sync', State.lastSync);

      // Reload
      State.schedules = await localDB.getAllSchedules();
      this.renderDashboard();
      this.renderSchedulesList();

      setSyncStatus('synced', `Tersinkron ${new Date().toLocaleTimeString('id-ID')}`);

      // Update last sync text
      const el = document.getElementById('last-sync-text');
      if (el) el.textContent = `Terakhir: ${new Date().toLocaleTimeString('id-ID')}`;
    } catch (err) {
      console.error('Sync error:', err);
      setSyncStatus('error', 'Sync gagal — coba lagi');
    } finally {
      State.isSyncing = false;
    }
  },

  // ─── Profile ──────────────────────────────────────────────
  renderProfile() {
    const user = State.user;
    if (!user) return;

    const initial = user.name?.charAt(0).toUpperCase() || '?';
    document.getElementById('profile-avatar').textContent = initial;
    document.getElementById('profile-name').textContent = user.name || '';
    document.getElementById('profile-username').textContent = `@${user.username}`;
    document.getElementById('profile-phone').textContent = `📱 ${user.phone || '-'}`;

    const roleBadge = document.getElementById('profile-role-badge');
    roleBadge.textContent = user.role === 'owner' ? '👑 Owner' : '👤 User';
    roleBadge.className = `badge ${user.role === 'owner' ? 'badge-in-progress' : 'badge-not-started'}`;

    // Show owner section only for owner/admin
    const ownerSection = document.getElementById('owner-section');
    if (ownerSection) {
      ownerSection.style.display = user.role === 'owner' ? 'block' : 'none';
    }

    // Last sync
    if (State.lastSync) {
      const el = document.getElementById('last-sync-text');
      if (el) el.textContent = `Terakhir: ${new Date(State.lastSync).toLocaleString('id-ID')}`;
    }

    // Theme toggle
    const current = document.documentElement.getAttribute('data-theme');
    const toggle = document.getElementById('theme-toggle-profile');
    if (toggle) toggle.checked = current === 'dark';

    lucide.createIcons();
  },

  openEditProfileModal() {
    const user = State.user;
    if (!user) return;
    document.getElementById('p-name').value = user.name || '';
    document.getElementById('p-phone').value = user.phone || '';
    document.getElementById('p-password').value = '';
    document.getElementById('profile-modal').classList.add('open');
    lucide.createIcons();
  },

  closeEditProfileModal() {
    document.getElementById('profile-modal').classList.remove('open');
  },

  async handleProfileUpdate(e) {
    e.preventDefault();
    const btn = document.getElementById('save-profile-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    try {
      const payload = {
        name: document.getElementById('p-name').value.trim(),
        phone: document.getElementById('p-phone').value.trim(),
        password: document.getElementById('p-password').value,
      };

      const res = await api('/me/profile', { method: 'PUT', body: payload });
      State.user = res.data.user;
      localStorage.setItem('sp_user', JSON.stringify(State.user));
      
      this.renderProfile();
      this.closeEditProfileModal();
      toast('Profil berhasil diperbarui ✨', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  },

  async requestPushPermission() {
    if (!('Notification' in window)) {
      toast('Browser tidak mendukung notifikasi', 'warning');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      toast('Notifikasi push diaktifkan!', 'success');
    } else {
      toast('Notifikasi ditolak oleh browser', 'warning');
    }
  },

  // ─── Owner Panel ──────────────────────────────────────────
  ownerTab(tab, btn) {
    document.querySelectorAll('#owner-page .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('owner-users').style.display = tab === 'users' ? 'block' : 'none';
    document.getElementById('owner-codes').style.display = tab === 'codes' ? 'block' : 'none';
  },

  async refreshUserList() {
    await this.loadUserList();
  },

  async loadUserList() {
    const container = document.getElementById('user-list');
    container.innerHTML = '<div class="empty-state"><p>Memuat...</p></div>';

    try {
      const res = await api('/owner/users');
      const users = res.data;

      if (!users.length) {
        container.innerHTML = '<div class="empty-state"><p>Belum ada pengguna terdaftar</p></div>';
        return;
      }

      container.innerHTML = '';
      users.forEach(user => {
        const expires = new Date(user.expires_at);
        const active = expires > new Date() && !user.is_suspended;
        const card = document.createElement('div');
        card.className = 'user-card';
        card.innerHTML = `
          <div class="user-avatar">${user.name?.charAt(0).toUpperCase() || '?'}</div>
          <div class="user-info">
            <div class="user-name">${escHtml(user.name)}</div>
            <div class="user-meta">@${user.username} · ${user.phone}</div>
            <div class="user-meta">
              ${user.is_suspended ? '🔴 Disuspend' : active ? '🟢 Aktif' : '🟡 Kadaluarsa'}
              · Hingga: ${expires.toLocaleDateString('id-ID')}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="App.suspendUser('${user._id}', this)">
              ${user.is_suspended ? 'Aktifkan' : 'Suspend'}
            </button>
            <button class="btn btn-success btn-sm" onclick="App.extendUser('${user._id}', this)">
              +30 hari
            </button>
          </div>`;
        container.appendChild(card);
      });
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p>Gagal memuat: ${err.message}</p></div>`;
    }
  },

  async suspendUser(userId, btn) {
    btn.disabled = true;
    try {
      await api(`/owner/users/${userId}/suspend`, { method: 'PUT' });
      toast('Status user diubah', 'success');
      await this.loadUserList();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  },

  async extendUser(userId, btn) {
    btn.disabled = true;
    try {
      await api(`/owner/users/${userId}/extend`, { method: 'PUT', body: { days: 30 } });
      toast('Masa aktif diperpanjang 30 hari', 'success');
      await this.loadUserList();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  },

  async loadCodeList() {
    const container = document.getElementById('code-list');
    container.innerHTML = '<div class="empty-state"><p>Memuat kode...</p></div>';

    try {
      const res = await api('/owner/registration-codes');
      const codes = res.data;

      if (!codes.length) {
        container.innerHTML = '<div class="empty-state"><p>Belum ada kode registrasi</p></div>';
        return;
      }

      container.innerHTML = '';
      codes.forEach(code => {
        const isValid = code.usage_count < code.max_usage && new Date(code.expires_at) > new Date();
        const card = document.createElement('div');
        card.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:14px;background:var(--bg-card);border:1px solid var(--border-light);border-radius:var(--radius-md);margin-bottom:8px;backdrop-filter:blur(10px);';
        card.innerHTML = `
          <div>
            <div style="font-family:monospace;font-size:18px;font-weight:700;letter-spacing:2px;color:var(--accent-light);">${code.code}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
              ${code.usage_count}/${code.max_usage} digunakan · 
              Hingga: ${new Date(code.expires_at).toLocaleDateString('id-ID')}
              ${code.note ? ` · ${code.note}` : ''}
            </div>
          </div>
          <span class="badge ${isValid ? 'badge-completed' : 'badge-not-started'}">${isValid ? 'Valid' : 'Habis'}</span>`;
        container.appendChild(card);
      });
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p>Gagal memuat: ${err.message}</p></div>`;
    }
  },

  openGenerateCodeModal() {
    document.getElementById('code-result').style.display = 'none';
    document.getElementById('code-form').reset();
    document.getElementById('code-max-usage').value = 1;
    document.getElementById('code-expires-days').value = 30;
    document.getElementById('code-modal').classList.add('open');
    lucide.createIcons();
  },

  closeCodeModal() {
    document.getElementById('code-modal').classList.remove('open');
    this.loadCodeList();
  },

  async handleGenerateCode(e) {
    e.preventDefault();
    const btn = document.getElementById('generate-code-btn');
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    try {
      const res = await api('/owner/generate-code', {
        method: 'POST',
        body: {
          max_usage: parseInt(document.getElementById('code-max-usage').value),
          expires_days: parseInt(document.getElementById('code-expires-days').value),
          note: document.getElementById('code-note').value.trim(),
        },
      });

      document.getElementById('generated-code').textContent = res.data.code;
      document.getElementById('code-result').style.display = 'block';
      toast(`Kode berhasil dibuat: ${res.data.code}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.innerHTML = '<i data-lucide="key"></i> Generate';
      btn.disabled = false;
      lucide.createIcons();
    }
  },
};

// ─── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('open');
    }
  });
});
