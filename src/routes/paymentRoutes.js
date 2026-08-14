const express = require('express');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

router.get('/', paymentController.getAllPayments);
router.post('/payhere/notify', paymentController.payhereNotify);

module.exports = router;
