const express = require('express');
const multer = require('multer');
const paymentController = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');
const { restrictTo } = require('../middleware/roleMiddleware');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', paymentController.getAllPayments);

// Tutor ad-posting payment flow (PayHere)
router.post('/ad/initiate', protect, restrictTo('tutor'), upload.single('banner'), paymentController.initiateAdPayment);
router.get('/ad/status/:orderId', protect, restrictTo('tutor'), paymentController.getAdPaymentStatus);
// Local development only — devCompleteAdPayment 404s itself when NODE_ENV=production.
router.post('/ad/dev-complete/:orderId', protect, restrictTo('tutor'), paymentController.devCompleteAdPayment);

// PayHere server-to-server webhook — PayHere calls this directly (no JWT),
// authenticity is verified via md5 signature inside the controller.
router.post('/payhere/notify', paymentController.handlePayhereNotify);

module.exports = router;
