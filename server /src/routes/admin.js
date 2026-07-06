const express = require('express');
const { authenticate, adminOnly } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

const router = express.Router();

// ── MANAJEMEN PESANAN & STATISTIK ──
router.get('/stats', authenticate, adminOnly, adminController.getStats);
router.get('/orders', authenticate, adminOnly, adminController.getOrders);
router.patch('/orders/:id/status', authenticate, adminOnly, adminController.updateOrderStatus);

// ── MANAJEMEN PRODUK ──
router.get('/products', authenticate, adminOnly, adminController.getProducts);
router.post('/products', authenticate, adminOnly, adminController.createProduct);
router.patch('/products/:id', authenticate, adminOnly, adminController.updateProduct);
router.delete('/products/:id', authenticate, adminOnly, adminController.deleteProduct);

module.exports = router;