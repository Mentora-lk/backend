const { pool } = require('../config/db');
const crypto = require('crypto');

// Payment Controller
module.exports = {
  getAllPayments: (req, res) => {
    res.json({ message: 'Get all payments' });
  },

  payhereNotify: async (req, res) => {
    try {
      const {
        merchant_id,
        order_id,
        payhere_amount,
        payhere_currency,
        status_code,
        md5sig,
        payment_id
      } = req.body;

      const merchantSecret = process.env.PAYHERE_SECRET;
      
      // PayHere MD5 signature verification
      const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
      const amountFormatted = parseFloat(payhere_amount).toFixed(2);
      const hashString = merchant_id + order_id + amountFormatted + payhere_currency + status_code + hashedSecret;
      const expectedMd5sig = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

      if (md5sig !== expectedMd5sig) {
        console.error('PayHere Checksum verification failed for order:', order_id);
        return res.status(400).send('Invalid Checksum');
      }

      // Check if status is successful (2 = Success)
      if (status_code === '2') {
        const paymentResult = await pool.query(
          'UPDATE tutor_payments SET status = $1, payment_id = $2, "updatedAt" = NOW() WHERE order_id = $3 AND status = $4 RETURNING ad_id',
          ['SUCCESS', payment_id, order_id, 'PENDING']
        );

        if (paymentResult.rows.length > 0) {
          const adId = paymentResult.rows[0].ad_id;
          // Publish the advertisement
          await pool.query(
            'UPDATE poatad SET status = $1, "updatedAt" = NOW() WHERE id = $2',
            ['active', adId]
          );
        }
      } else if (status_code === '-1' || status_code === '-2' || status_code === '-3') {
        // Canceled or Failed
        await pool.query(
          'UPDATE tutor_payments SET status = $1, payment_id = $2, "updatedAt" = NOW() WHERE order_id = $3',
          ['FAILED', payment_id, order_id]
        );
      }

      res.status(200).send('OK');
    } catch (err) {
      console.error('Error in payhereNotify:', err);
      res.status(500).send('Internal Server Error');
    }
  }
};
