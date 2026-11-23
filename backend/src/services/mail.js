const DEFAULT_FROM = 'Unidex <onboarding@resend.dev>';

let warnedMissingKey = false;
let client = null;
let clientKey = '';

function warnIfNoResendKey() {
  if (String(process.env.RESEND_API_KEY || '').trim()) return false;
  if (!warnedMissingKey) {
    console.warn('RESEND_API_KEY is not set. Password reset emails will not be sent.');
    warnedMissingKey = true;
  }
  return true;
}

function getResend() {
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) {
    warnIfNoResendKey();
    return null;
  }
  if (!client || clientKey !== key) {
    const { Resend } = require('resend');
    client = new Resend(key);
    clientKey = key;
  }
  return client;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function expiryCopy(ttlMinutes) {
  if (ttlMinutes === 60) return { en: '1 hour', ar: 'ساعة واحدة' };
  return { en: `${ttlMinutes} minutes`, ar: `${ttlMinutes} دقيقة` };
}

function passwordResetMessage(resetLink, ttlMinutes) {
  const safeLink = escapeHtml(resetLink);
  const expiry = expiryCopy(ttlMinutes);
  const text = [
    `Reset your Unidex password. This link works once and expires in ${expiry.en}:`,
    resetLink,
    '',
    'If you did not request this, you can ignore this message.',
    '',
    `إعادة تعيين كلمة مرور Unidex. هذا الرابط يعمل مرة واحدة وينتهي بعد ${expiry.ar}:`,
    resetLink,
    '',
    'إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="ar">
<body>
  <p dir="ltr">Reset your Unidex password. This link works once and expires in ${escapeHtml(expiry.en)}.</p>
  <p dir="ltr"><a href="${safeLink}">${safeLink}</a></p>
  <p dir="ltr">If you did not request this, you can ignore this message.</p>
  <hr>
  <p dir="rtl">إعادة تعيين كلمة مرور Unidex. هذا الرابط يعمل مرة واحدة وينتهي بعد ${escapeHtml(expiry.ar)}.</p>
  <p dir="ltr"><a href="${safeLink}">${safeLink}</a></p>
  <p dir="rtl">إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.</p>
</body>
</html>`;

  return { text, html };
}

// Logs failures and returns. Callers still respond with the generic success body.
async function sendPasswordResetEmail({ to, resetLink, ttlMinutes }) {
  const resend = getResend();
  if (!resend) return;
  const from = String(process.env.RESEND_FROM || '').trim() || DEFAULT_FROM;
  const { text, html } = passwordResetMessage(resetLink, ttlMinutes);
  try {
    const result = await resend.emails.send({
      from,
      to: [to],
      subject: 'Unidex password reset / إعادة تعيين كلمة المرور',
      html,
      text,
    });
    if (result && result.error) {
      const message = result.error.message || result.error.name || 'send failed';
      console.error('Failed to send password reset email:', message);
    }
  } catch (err) {
    console.error('Failed to send password reset email:', err && err.message ? err.message : err);
  }
}

module.exports = { sendPasswordResetEmail, warnIfNoResendKey, DEFAULT_FROM };
