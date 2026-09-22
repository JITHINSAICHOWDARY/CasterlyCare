// "14:30" -> "2:30 PM". Display only.
export function slotLabel(time24) {
  const match = /^(\d{2}):(\d{2})$/.exec(time24 || '');
  if (!match) return time24 || '';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

// "8:30 PM" -> "20:30"; anything unparseable -> ''.
export function to24Hour(value) {
  const match = String(value || '').trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) return '';
  let hour = Number(match[1]);
  if (hour < 1 || hour > 12 || Number(match[2]) > 59) return '';
  if (match[3] === 'AM' && hour === 12) hour = 0;
  if (match[3] === 'PM' && hour !== 12) hour += 12;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

// "20:30" -> "8:30 PM".
export function to12Hour(time24) {
  return slotLabel(time24);
}

// Relative time for notes: "Just now", "12 min ago", "Today, 2:14 PM", "Yesterday, 9:02 AM", "12 Sep, 3:40 PM".
export function friendlyTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Not recorded';
  const diff = Date.now() - date.getTime();
  if (diff < 60 * 1000) return 'Just now';
  if (diff < 3600 * 1000) return `${Math.floor(diff / 60000)} min ago`;
  const clock = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(date)) / 86400000);
  if (days === 0) return `Today, ${clock}`;
  if (days === 1) return `Yesterday, ${clock}`;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short', ...(days > 300 ? { year: 'numeric' } : {}) })}, ${clock}`;
}

// "10:24 AM" for today, "Yesterday", else "21 Sep" - for compact list rows.
export function listTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(date)) / 86400000);
  if (days === 0) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// "Today", "Yesterday", else "Mon 21 Sep" - day dividers in a conversation.
export function dayLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(date)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

export function clockTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
}
