/**
 * OTP-by-SMS delivery.
 *
 * Provider: 2Factor.in, called with plain fetch (their API is a single GET,
 * no SDK needed). We generate/hash/verify the OTP ourselves (see routes/auth.js)
 * and just ask 2Factor to deliver a code we already chose — their "custom OTP"
 * endpoint, not AUTOGEN, so our own expiry/attempt-limit logic stays in charge.
 *
 * Leave TWOFACTOR_API_KEY unset to run in console-log fallback mode — the
 * OTP is logged server-side and echoed back in the API response so the
 * demo works end-to-end with no SMS account, same pattern as the LLM
 * integration's fallback mode.
 */

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

const smsConfigured = Boolean(process.env.TWOFACTOR_API_KEY);

// Callers always pass the app's canonical bare-10-digit form (see utils/phone.js)
// — 2Factor just needs the "91" country code prepended for delivery.
async function sendOtpSms(phone, code) {
  if (!smsConfigured) {
    console.log(`[OTP fallback mode] Code for ${phone}: ${code}`); // eslint-disable-line no-console
    return { delivered: false };
  }

  const url = `https://2factor.in/API/V1/${process.env.TWOFACTOR_API_KEY}/SMS/91${phone}/${code}`;

  const res = await fetch(url);
  const data = await res.json().catch(() => null);

  if (!res.ok || data?.Status !== 'Success') {
    throw new Error(`2Factor SMS send failed: ${data?.Details || res.status}`);
  }

  return { delivered: true };
}

module.exports = { generateOtpCode, sendOtpSms, smsConfigured };
