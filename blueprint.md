🚀 BLUEPRINT FINAL APLIKASI SCHEDULER (PRODUCTION READY)
🏗️ 1. ARSITEKTUR SISTEM
🔷 High-Level Architecture
[PWA Frontend (Offline First)]
        ↓
[REST API - Node.js + Express]
        ↓
[MongoDB Atlas]

[Queue System]
BullMQ + Redis (Upstash)

[Worker Service]
Node.js (separate process)

[Notification]
WhatsApp (Fonnte) + Web Push
🔧 Stack Final
Layer	Teknologi	Peran
Frontend	HTML, Tailwind, Vanilla JS	UI
PWA	Service Worker	Offline
Local DB	IndexedDB	Cache & sync
Backend	Node.js + Express	API
DB	MongoDB Atlas	Data utama
Queue	BullMQ + Redis	Scheduling
Worker	Node.js	Eksekusi job
WA API	Fonnte	Notifikasi utama
Push	Web Push API	Backup
Hosting	Vercel + Railway/Render	Deploy
🧠 2. DATABASE DESIGN (FINAL)
👤 Users
{
  _id: ObjectId,
  username: String,
  password: String, // bcrypt
  name: String,
  phone: String,

  role: "owner" | "user",

  theme: "light" | "dark",

  expires_at: Date,

  created_at: Date,
  updated_at: Date
}
📅 Schedules
{
  _id: ObjectId,
  user_id: ObjectId,

  title: String,
  description: String,

  deadline: Date,

  status: "not_started" | "in_progress" | "completed",

  repeat: {
    enabled: Boolean,
    rules: [
      {
        day: "monday",
        time: "09:30"
      }
    ]
  },

  is_deleted: Boolean,

  version: Number,

  created_at: Date,
  updated_at: Date
}
⏰ Reminders (Embedded)
{
  _id: ObjectId,

  remind_at: Date,

  is_sent: Boolean,

  retry_count: Number,

  job_id: String
}
🔑 Registration Codes
{
  code: String,

  is_used: Boolean,

  usage_count: Number,
  max_usage: Number,

  expires_at: Date,

  created_at: Date
}
🔄 3. OFFLINE-FIRST SYNC SYSTEM
📱 Local (IndexedDB)
{
  _id,
  data,
  is_synced: false,
  is_deleted: false,
  updated_at
}
🌐 Endpoint
POST /api/sync
📦 Request
{
  last_sync: Date,
  changes: []
}
⚙️ Backend Logic
if (client.updated_at > server.updated_at) {
  update server
} else {
  kirim balik versi server
}
📤 Response
{
  success: true,
  server_changes: []
}
🔥 RULE WAJIB
Last Write Wins
Soft Delete (is_deleted)
Version tracking
Retry sync saat gagal
🔔 4. QUEUE SYSTEM (BULLMQ)
🎯 Konsep
1 reminder = 1 job
Delay sesuai waktu reminder
Tidak ada polling ❌
📦 Create Job
queue.add("reminder", {
  schedule_id,
  reminder_id,
  user_id
}, {
  jobId: reminder_id,
  delay: remind_at - Date.now(),
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 60000
  }
})
⚠️ Update/Delete RULE

Saat schedule berubah:

remove old jobs
create new jobs
⚙️ 5. WORKER SYSTEM (TERPISAH)

File: worker.js

🔁 Flow
1. Ambil schedule
2. Validasi:
   - tidak deleted
   - tidak completed
3. Kirim WA
4. Update status reminder
🧠 Anti Zombie Notification
if (!schedule) return
if (schedule.is_deleted) return
if (schedule.status === "completed") return
if (reminder.is_sent) return
🔔 6. NOTIFICATION SYSTEM
📱 PRIORITAS
WhatsApp (utama)
Push Notification (backup)
💬 Format WA
🔔 PENGINGAT TUGAS

📌 Judul: {title}
⏰ Deadline: {deadline}
⚠️ Status: {status}

Segera kerjakan!
🔁 Retry Strategy
attempts: 5
exponential backoff
📊 Tracking
delivery_log: [
  {
    type: "whatsapp",
    status: "sent" | "failed",
    sent_at
  }
]
🔁 7. REPEAT SYSTEM (ADVANCED)
📦 Struktur
repeat: {
  enabled: true,
  rules: [
    { day: "monday", time: "09:00" },
    { day: "thursday", time: "14:30" }
  ]
}
⚙️ Logic

Saat job selesai:

generate next reminder
push ke queue
🔐 8. AUTH & SECURITY
✅ Authentication
JWT
bcrypt
🔒 Proteksi
Rate limit
Input validation (Joi/Zod)
JWT expiration
👑 Owner Role

Boleh:

generate kode
atur masa aktif user
suspend user

Tidak boleh:

akses task user
📡 9. API DESIGN
🔑 Auth
POST /api/register
POST /api/login
📅 Schedule
GET /api/schedules
POST /api/schedules
PUT /api/schedules/:id
DELETE /api/schedules/:id
🔄 Sync
POST /api/sync
👑 Owner
POST /api/generate-code
GET /api/users
📁 10. STRUKTUR FOLDER
/project-root

/frontend
  index.html
  app.js
  db.js
  sw.js
  manifest.json

/backend
  server.js
  worker.js

  /config
  /models
  /routes
  /controllers
  /queue
  /services

.env
📱 11. UX DESIGN
🔌 Offline Mode
indikator aktif
🔄 Sync Status
belum sinkron
sedang sinkron
terakhir sinkron
❌ Error
tombol "Sync Ulang"
📈 12. SCALABILITY
User	Status
100–500	Aman
1000	Stabil
5000+	Perlu optimasi
☁️ 13. DEPLOYMENT
Frontend
Vercel
Backend
Railway / Render
Redis
Upstash
DB
MongoDB Atlas
🧠 14. PRIORITAS IMPLEMENTASI
Minggu 1
PWA + IndexedDB
Minggu 2
Auth + MongoDB
Minggu 3
Sync System
Minggu 4
Queue + Notification
🎯 FINAL STATUS

Blueprint ini:

🔥 Production-Ready MVP (Public App Level)

Dengan keunggulan:

Offline-first
Queue-based (bukan polling)
WA notification reliable
Flexible scheduling
Scalable architecture