// PayHere payment gateway config + hash helpers.
// Docs: https://support.payhere.lk/api-&-mobile-sdk/payhere-checkout
const crypto = require('crypto');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;

const config = {
  merchantId: process.env.PAYHERE_MERCHANT_ID,
  merchantSecret: process.env.PAYHERE_SECRET,
  currency: process.env.CURRENCY || 'LKR',
  // Flat fee a tutor pays to publish one class ad.
  adPostFee: Number(process.env.POST_AD_FEE) || 1000,
  // PayHere calls this server-to-server after payment completes/fails.
  // Sandbox cannot reach localhost — tunnel with ngrok and override via env for local testing.
  notifyUrl: process.env.PAYHERE_NOTIFY_URL || `${BACKEND_URL}/api/payments/payhere/notify`,
  // Only used by PayHere's classic redirect checkout; the JS SDK we use relies on
  // onCompleted/onDismissed/onError callbacks instead, but the field is still required.
  returnUrl: `${FRONTEND_URL}/dashboard/tutor/post-ad/payment-status`,
  cancelUrl: `${FRONTEND_URL}/dashboard/tutor/post-ad/payment-status`,
};

// PayHere requires the amount formatted to exactly 2 decimal places in both
// the checkout hash and the notify signature.
const formatAmount = (amount) => Number(amount).toFixed(2);

// Hash sent with the checkout request so PayHere can trust it came from us.
const generateCheckoutHash = (orderId, amount) => {
  const secretHash = crypto
    .createHash('md5')
    .update(config.merchantSecret)
    .digest('hex')
    .toUpperCase();

  return crypto
    .createHash('md5')
    .update(`${config.merchantId}${orderId}${formatAmount(amount)}${config.currency}${secretHash}`)
    .digest('hex')
    .toUpperCase();
};

// Verifies the md5sig PayHere sends to the notify_url webhook.
const verifyNotifySignature = ({ merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig }) => {
  if (!merchant_id || !order_id || !payhere_amount || !payhere_currency || !status_code || !md5sig) {
    return false;
  }

  const secretHash = crypto
    .createHash('md5')
    .update(config.merchantSecret)
    .digest('hex')
    .toUpperCase();

  const expected = crypto
    .createHash('md5')
    .update(`${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${secretHash}`)
    .digest('hex')
    .toUpperCase();

  return expected === String(md5sig).toUpperCase();
};

module.exports = { config, formatAmount, generateCheckoutHash, verifyNotifySignature };
