// Payment Controller — PayHere ad-posting payment flow.
//
// Flow:
//  1. Tutor submits the post-ad form -> initiateAdPayment() stages it in
//     `poatad` (status='pending_payment') and opens a `tutor_payments` order.
//  2. Frontend opens PayHere's checkout using the returned order/hash.
//  3. PayHere POSTs the result to handlePayhereNotify() (server-to-server,
//     signature-verified) — on success the draft is copied into the live
//     `courses` table; the ad only ever goes public once payment clears.
//  4. Frontend polls getAdPaymentStatus() (the browser-side onCompleted
//     callback alone is not trusted — the webhook is the source of truth).
const { pool } = require('../config/db');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const { toScheduleJsonb } = require('./courseController');
const { config, formatAmount, generateCheckoutHash, verifyNotifySignature } = require('../config/payhere');

// POST /api/payments/ad/initiate (tutor only)
const initiateAdPayment = async (req, res, next) => {
  try {
    const { title, subject, description, fee, schedule, medium, grade } = req.body;

    if (!title || !subject || !fee) {
      return res.status(400).json({ message: 'Title, subject, and fee are required' });
    }

    const tutorId = req.user.id;

    let imageUrl = '';
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file.buffer, 'mentora/ad-banners', req.file.originalname);
    }

    // Stage the ad — it only reaches the public `courses` table once the
    // PayHere webhook confirms payment (see handlePayhereNotify below).
    const adResult = await pool.query(
      `INSERT INTO poatad
        (tutor_id, title, subject, description, fee, schedule, grade, medium, image, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending_payment', NOW(), NOW())
       RETURNING *`,
      [tutorId, title, subject, description || '', fee, toScheduleJsonb(schedule), grade || '', medium || '', imageUrl]
    );
    const ad = adResult.rows[0];

    const orderId = `AD-${ad.id}-${Date.now()}`;
    const amount = formatAmount(config.adPostFee);

    await pool.query(
      `INSERT INTO tutor_payments (tutor_id, ad_id, order_id, amount, currency, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW(), NOW())`,
      [tutorId, ad.id, orderId, amount, config.currency]
    );

    // Billing details PayHere's checkout form requires.
    const [profileResult, userResult] = await Promise.all([
      pool.query('SELECT full_name, phone, address, city, email FROM tutor_profiles WHERE user_id = $1', [tutorId]),
      pool.query('SELECT email FROM users WHERE id = $1', [tutorId]),
    ]);
    const profile = profileResult.rows[0] || {};
    const trim = (v) => (typeof v === 'string' ? v.trim() : v);
    const [firstName, ...rest] = (trim(profile.full_name) || 'Mentora Tutor').split(/\s+/);

    res.status(201).json({
      adId: ad.id,
      orderId,
      amount,
      currency: config.currency,
      hash: generateCheckoutHash(orderId, amount),
      merchantId: config.merchantId,
      items: `Mentora ad posting fee — ${title}`,
      firstName: firstName || 'Mentora',
      lastName: rest.join(' ') || 'Tutor',
      email: trim(profile.email) || trim(userResult.rows[0]?.email) || '',
      phone: trim(profile.phone) || '0770000000',
      address: trim(profile.address) || 'N/A',
      city: trim(profile.city) || 'Colombo',
      country: 'Sri Lanka',
      notifyUrl: config.notifyUrl,
      returnUrl: config.returnUrl,
      cancelUrl: config.cancelUrl,
    });
  } catch (err) {
    next(err);
  }
};

// Shared by the real PayHere webhook and the local-dev test-completion route
// below — copies a staged `poatad` draft into the live `courses` table and
// marks the order COMPLETED. Caller must already have confirmed the order is
// genuinely PENDING (both call sites below do this before invoking it).
const publishAdForPayment = async (payment, paymentId) => {
  const adResult = await pool.query('SELECT * FROM poatad WHERE id = $1', [payment.ad_id]);
  const ad = adResult.rows[0];
  if (!ad) return null;

  const courseResult = await pool.query(
    `INSERT INTO courses
      (tutor_id, title, subject, description, fee, schedule, mode, location, max_students, status, image, grade, medium, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, 'both', 'Remote', 50, 'active', $7, $8, $9, NOW(), NOW())
     RETURNING id`,
    [ad.tutor_id, ad.title, ad.subject, ad.description, ad.fee, ad.schedule, ad.image, ad.grade, ad.medium]
  );

  await pool.query(`UPDATE poatad SET status = 'published', "updatedAt" = NOW() WHERE id = $1`, [ad.id]);
  await pool.query(
    `UPDATE tutor_payments SET status = 'COMPLETED', payment_id = $1, course_id = $2, "updatedAt" = NOW() WHERE id = $3`,
    [paymentId || null, courseResult.rows[0].id, payment.id]
  );

  return courseResult.rows[0].id;
};

// POST /api/payments/payhere/notify — server-to-server webhook, PayHere calls
// this directly (no session/JWT available), so trust is established purely
// via the md5 signature instead of the `protect` middleware.
const handlePayhereNotify = async (req, res) => {
  const { merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig, payment_id } = req.body;

  try {
    if (!verifyNotifySignature({ merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig })) {
      console.warn('⚠️  PayHere notify: signature verification failed for order', order_id);
      return res.status(400).send('Invalid signature');
    }

    const paymentResult = await pool.query('SELECT * FROM tutor_payments WHERE order_id = $1', [order_id]);
    const payment = paymentResult.rows[0];
    if (!payment) {
      console.warn('⚠️  PayHere notify: unknown order_id', order_id);
      return res.status(404).send('Order not found');
    }

    // PayHere may retry the webhook — make sure we only publish the ad once.
    if (payment.status !== 'PENDING') {
      return res.status(200).send('OK');
    }

    if (status_code === '2') {
      await publishAdForPayment(payment, payment_id);
    } else if (status_code !== '0') {
      // -1 cancelled, -2 failed, -3 chargedback. (status_code '0' = still
      // pending on PayHere's side, e.g. bank processing — leave as PENDING.)
      await pool.query(
        `UPDATE tutor_payments SET status = 'FAILED', payment_id = $1, "updatedAt" = NOW() WHERE id = $2`,
        [payment_id || null, payment.id]
      );
      await pool.query(`UPDATE poatad SET status = 'payment_failed', "updatedAt" = NOW() WHERE id = $1`, [payment.ad_id]);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('PayHere notify handler error:', err);
    // 500 so PayHere retries the webhook later instead of losing the event.
    res.status(500).send('Error');
  }
};

// GET /api/payments/ad/status/:orderId (tutor only, must own the order) —
// polled by the frontend while waiting for the webhook above to land.
const getAdPaymentStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const result = await pool.query(
      'SELECT status, course_id, ad_id FROM tutor_payments WHERE order_id = $1 AND tutor_id = $2',
      [orderId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

const getAllPayments = (req, res) => {
  res.json({ message: 'Get all payments' });
};

// POST /api/payments/ad/dev-complete/:orderId — LOCAL DEVELOPMENT ONLY.
// Lets a tutor skip PayHere's sandbox card entry while testing the rest of
// the post-ad flow. Hard-gated server-side on NODE_ENV so no client-side
// flag or build config can make this reachable in production; there is no
// separate "test mode" toggle to accidentally leave on.
const devCompleteAdPayment = async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' });
  }

  try {
    const { orderId } = req.params;
    const paymentResult = await pool.query(
      'SELECT * FROM tutor_payments WHERE order_id = $1 AND tutor_id = $2',
      [orderId, req.user.id]
    );
    const payment = paymentResult.rows[0];
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    if (payment.status !== 'PENDING') {
      return res.status(200).json({ status: payment.status, course_id: payment.course_id });
    }

    const courseId = await publishAdForPayment(payment, `DEV-${Date.now()}`);
    res.json({ status: 'COMPLETED', course_id: courseId });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  initiateAdPayment,
  handlePayhereNotify,
  getAdPaymentStatus,
  devCompleteAdPayment,
  getAllPayments,
};
