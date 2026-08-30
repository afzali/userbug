const dateTime = new Intl.DateTimeFormat('fa-IR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const number = new Intl.NumberFormat('fa-IR');

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : dateTime.format(date);
}

export function formatNumber(value) {
  return number.format(Number(value || 0));
}

export function formatDuration(ms) {
  const value = Number(ms || 0);
  if (value < 1000) return `${formatNumber(value)} میلی‌ثانیه`;
  if (value < 60_000) return `${formatNumber(Math.round(value / 100) / 10)} ثانیه`;
  return `${formatNumber(Math.round(value / 6000) / 10)} دقیقه`;
}

export function statusLabel(status) {
  return {
    starting: 'در حال راه‌اندازی',
    running: 'در حال اجرا',
    cancelling: 'در حال لغو',
    passed: 'بدون یافته',
    failed: 'یافته دارد',
    finished: 'پایان‌یافته',
    findings: 'یافته دارد',
    error: 'خطای اجراگر',
    cancelled: 'لغوشده',
    unreadable: 'خوانده نشد',
  }[status] || status || 'نامشخص';
}

export function sourceLabel(source) {
  return {
    console: 'کنسول',
    pageerror: 'جاوااسکریپت',
    http: 'HTTP',
    network: 'شبکه',
    server: 'سرور',
    blocker: 'مزاحم',
    scenario: 'سناریو',
    dialog: 'دیالوگ',
  }[source] || source || 'رخداد';
}

export function shortId(value, length = 12) {
  return String(value || '').slice(0, length);
}
