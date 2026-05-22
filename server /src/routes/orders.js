const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Setup multer untuk upload bukti bayar
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename:    (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'payment-' + unique + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage,
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|pdf/;
        cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Generate order code
const generateOrderCode = () => {
    const date = new Date();
    const ymd  = date.getFullYear().toString().slice(-2) +
                 String(date.getMonth()+1).padStart(2,'0') +
                 String(date.getDate()).padStart(2,'0');
    const rand = Math.random().toString(36).substr(2,5).toUpperCase();
    return `ORD-${ymd}-${rand}`;
};

router.post('/', async (req, res) => {
    try {
        const { productName, productId, config, totalPrice, notes, customerName, customerPhone, customerEmail, customerAddress } = req.body;
        
        const order = await prisma.order.create({
            data: {
                orderCode:       generateOrderCode(),
                userId:          1, // guest default, update jika ada auth
                productId:       parseInt(productId) || 1,
                productName,
                config:          typeof config === 'object' ? JSON.stringify(config) : config,
                totalPrice:      parseInt(totalPrice),
                notes,
                status:          'PENDING',
                customerName,
                customerPhone,
                customerEmail,
                customerAddress
            }
        });
        res.json({ message: 'Pesanan berhasil dibuat', order });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Upload bukti bayar --- (AUTHENTICATE DAN REQ.USER.ID SUDAH DIHAPUS) ---
router.post('/:id/payment', upload.single('proof'), async (req, res) => {
    try {
        const order = await prisma.order.findFirst({
            where: { id: parseInt(req.params.id) } // Cari murni berdasarkan ID order saja
        });
        
        if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
        if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });

        await prisma.order.update({
            where: { id: order.id },
            data:  { paymentProof: req.file.filename, status: 'WAITING_APPROVAL' }
        });
        res.json({ message: 'Bukti bayar berhasil diupload' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// List pesanan user (Tetap pakai authenticate karena ini buat dashboard)
router.get('/my', authenticate, async (req, res) => {
    try {
        const orders = await prisma.order.findMany({
            where:   { userId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json(orders);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;