const express = require('express');
const { authenticate } = require('../middleware/auth');
const orderController = require('../controllers/orderController');

const router = express.Router();

router.post('/', authenticate, orderController.createOrder);
router.post('/:id/payment', authenticate, orderController.handleUpload, orderController.uploadPayment);
router.get('/my', authenticate, orderController.getMyOrders);
router.get('/:id', authenticate, orderController.getOrderById);

module.exports = router;