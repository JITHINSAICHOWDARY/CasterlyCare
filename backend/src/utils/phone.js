// Canonical phone format for this app: bare 10-digit Indian mobile number,
// no country code, no spaces/dashes/parens. This is the number OTP login and
// 2Factor SMS delivery key off of, so every place a user's OWN phone number
// is entered (signup, profile edit, admin-created doctor accounts) has to
// agree on the same shape — otherwise OTP login can't find the account.
// (Not used for unrelated fields like a patient's emergency contact, which
// can be anyone's number in any format.)
function normalizePhone(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return '';
  let digits = String(input).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

function isValidPhone(input) {
  return /^[6-9]\d{9}$/.test(normalizePhone(input));
}

module.exports = { normalizePhone, isValidPhone };
