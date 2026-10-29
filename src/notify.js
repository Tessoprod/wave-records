// Необов'язкове сповіщення про нове бронювання в Telegram.
import { config } from './config.js';
import { fmt } from './time.js';

export async function notifyNewBooking(b) {
  const { token, chatId } = config.telegram;
  if (!token || !chatId) return;
  const text = [
    `🎙 Нове бронювання ${b.code}`,
    `${b.service_name}`,
    `${fmt.long(b.start_ms)}, ${fmt.range(b.start_ms, b.end_ms)}`,
    '',
    `${b.name}`,
    `${b.phone}`,
    b.telegram ? `@${b.telegram}` : '',
    b.email || '',
    b.comment ? `\n💬 ${b.comment}` : '',
    config.publicUrl ? `\n${config.publicUrl}/admin/bookings/${b.id}` : '',
  ].filter((l) => l !== '').join('\n');
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error('[telegram] Помилка відправки:', res.status, await res.text().catch(() => ''));
  } catch (err) {
    console.error('[telegram] Помилка відправки:', err.message);
  }
}
