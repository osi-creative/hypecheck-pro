const axios = require('axios');
const webpush = require('web-push');

// Setup VAPID keys untuk Web Push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@schedulepro.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/**
 * Kirim notifikasi WhatsApp via Fonnte
 */
const sendWhatsApp = async (phone, message) => {
  const token = process.env.FONNTE_TOKEN;
  if (!token || token === 'your_fonnte_api_token_here') {
    console.log(`📱 [MOCK WA] To: ${phone}\n${message}`);
    return { success: true, mock: true };
  }

  try {
    let targetPhone = phone.replace(/\D/g, '');
    if (targetPhone.startsWith('0')) {
      targetPhone = '62' + targetPhone.substring(1);
    } else if (!targetPhone.startsWith('62')) {
      targetPhone = '62' + targetPhone;
    }

    const response = await axios.post(
      'https://api.fonnte.com/send',
      {
        target: targetPhone,
        message: message,
      },
      {
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    if (response.data?.status) {
      return { success: true, data: response.data };
    } else {
      return { success: false, error: response.data?.reason || 'Unknown error' };
    }
  } catch (error) {
    console.error('❌ Fonnte Error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Kirim Web Push Notification
 */
const sendPushNotification = async (subscription, payload) => {
  if (!subscription) return { success: false, error: 'No subscription' };

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (error) {
    console.error('❌ Push Error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Format pesan WA berdasarkan data schedule
 */
const formatReminderMessage = (schedule) => {
  const deadline = new Date(schedule.deadline);
  const deadlineStr = deadline.toLocaleString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });

  const statusMap = {
    not_started: '🔴 Belum dimulai',
    in_progress: '🟡 Sedang dikerjakan',
    completed: '🟢 Selesai',
  };

  return `🔔 *PENGINGAT TUGAS - Schedule Pro*

📌 *Judul:* ${schedule.title}
${schedule.description ? `📝 *Deskripsi:* ${schedule.description}\n` : ''}⏰ *Deadline:* ${deadlineStr}
⚠️ *Status:* ${statusMap[schedule.status] || schedule.status}

Segera kerjakan! ✨

_Dikirim oleh Schedule Pro_`;
};

module.exports = { sendWhatsApp, sendPushNotification, formatReminderMessage };
