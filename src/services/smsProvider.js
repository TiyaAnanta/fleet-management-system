// Mock SMS provider (stand-in for a Twilio sandbox). Never hits the network.
// A message "fails" if the number is malformed or listed in SMS_FAIL_NUMBERS.
const failList = () => (process.env.SMS_FAIL_NUMBERS || '').split(',').filter(Boolean);
async function sendSms(to, body) {
  if (!/^\+\d{8,15}$/.test(to || '') || failList().includes(to)) {
    const err = new Error(`SMS delivery failed for ${to}`); err.code = 'SMS_FAILED'; throw err;
  }
  return { sid: 'SM' + Math.random().toString(16).slice(2, 10), to, body, provider: 'mock-twilio' };
}
module.exports = { sendSms };
