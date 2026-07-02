const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const ALLOWED_MIMETYPES  = ['image/png', 'image/jpeg'];

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const unique  = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const safeExt = file.mimetype === 'image/png' ? '.png' : '.jpg';
        cb(null, 'payment-' + unique + safeExt);
    }
});

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isExtAllowed  = ALLOWED_EXTENSIONS.includes(ext);
    const isMimeAllowed = ALLOWED_MIMETYPES.includes(file.mimetype);

    if (!isExtAllowed || !isMimeAllowed) {
        return cb(new Error('Hanya file gambar PNG, JPG, atau JPEG yang diperbolehkan.'));
    }
    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

function handleUpload(req, res, next) {
    upload.single('proof')(req, res, async (err) => {
        if (err) {
            if (req.params.id) {
                try { await prisma.order.delete({ where: { id: parseInt(req.params.id) } }); } 
                catch (e) { /* abaikan jika gagal hapus */ }
            }
            // ---------------------------------------------------------------
            
            const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file maksimal 5MB.' : err.message;
            return res.status(400).json({ error: msg });
        }
        next();
    });
}

function isValidImageSignature(filePath) {
    const buffer = fs.readFileSync(filePath, { encoding: null, flag: 'r' }).subarray(0, 8);
    const isPNG  = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isJPEG = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    return isPNG || isJPEG;
}

const generateOrderCode = () => {
    const date = new Date();
    const ymd  = date.getFullYear().toString().slice(-2) +
                 String(date.getMonth()+1).padStart(2,'0') +
                 String(date.getDate()).padStart(2,'0');
    const rand = Math.random().toString(36).substr(2,5).toUpperCase();
    return `ORD-${ymd}-${rand}`;
};

// ── HELPER WA WABLAS (PADAT) ──────────────────────────────────
const formatNoWA = (no) => no?.startsWith('0') ? '62' + no.slice(1) : no;
const sendWA = async (target, message) => {
  try {
    const domain = 'https://smg.wablas.com'; 
    const token  = 'oFdcnXbhislmPc9sNIcMeugzMpBZpK1nkqRpWgtz057NSJKKyLlgW5v';  
    const secret = 'av7Ev3Ib'; 
    
    await fetch(`${domain}/api/send-message`, {
      method: 'POST',
      headers: { 
        'Authorization': `${token}.${secret}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ phone: target, message })
    }).catch(e => console.error('Error Wablas:', e));
  } catch (e) { console.error('Error:', e.message); }
};


router.post('/', authenticate, async (req, res) => {
    try {
        const {
            productName, productId, config, totalPrice, notes,
            customerName, customerPhone, customerEmail, customerAddress
        } = req.body;

        const order = await prisma.order.create({
            data: {
                orderCode:       generateOrderCode(),
                userId:          req.user.id, 
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
        // --- KODE BARU: NOTIFIKASI WA KE ADMIN ---
        const pesanAdmin = `🚨 *Pesanan Baru Masuk!*\nKode: ${order.orderCode}\nNama: ${customerName}\nItem: ${productName}\nTotal: Rp${totalPrice}\n\nMohon segera dicek di Dashboard.`;
        await sendWA('6281218212498', pesanAdmin);

        // 2. KODE BARU: NOTIFIKASI WA KE PELANGGAN
        const nomorPelanggan = formatNoWA(customerPhone);
        const pesanPelanggan = `Halo Kak *${customerName}*,\n\nTerima kasih telah berbelanja di *Debbi Meubel*. Pesanan Anda dengan kode *${order.orderCode}* telah kami terima.\n\nTotal Pembayaran: *Rp${totalPrice}*\nStatus: *MENUNGGU PERSETUJUAN*\n\nBukti pembayaran Anda telah masuk ke sistem dan saat ini sedang menunggu konfirmasi dari admin. Kami akan memberikan update segera setelah pesanan diproses. Terima kasih!`;
        await sendWA(nomorPelanggan, pesanPelanggan);

        res.json({ message: 'Pesanan berhasil dibuat', order });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// POST /api/orders/:id/payment — UPLOAD BUKTI BAYAR
// ============================================================
router.post('/:id/payment', authenticate, handleUpload, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File tidak ditemukan.' });
        }

        const filePath = path.join('uploads', req.file.filename);

        if (!isValidImageSignature(filePath)) {
            fs.unlinkSync(filePath);
            
            await prisma.order.delete({ where: { id: parseInt(req.params.id) } });
            // ------------------------------------------------------------
            
            return res.status(400).json({ error: 'File tidak valid atau rusak. Pastikan file adalah gambar PNG/JPG asli.' });
        }

        const order = await prisma.order.findFirst({
            where: { id: parseInt(req.params.id), userId: req.user.id }
        });

        if (!order) {
            fs.unlinkSync(filePath);
            return res.status(404).json({ error: 'Pesanan tidak ditemukan atau bukan milik Anda.' });
        }

        await prisma.order.update({
            where: { id: order.id },
            data:  { paymentProof: req.file.filename, status: 'WAITING_APPROVAL' }
        });

        res.json({ message: 'Bukti bayar berhasil diupload' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// GET /api/orders/my — DAFTAR PESANAN MILIK USER YANG LOGIN
// Dipakai untuk halaman "Pesanan Saya"
// ============================================================
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

// ============================================================
// GET /api/orders/:id — DETAIL 1 PESANAN (untuk halaman detail)
// Hanya bisa diakses kalau order itu memang miliknya
// ============================================================
router.get('/:id', authenticate, async (req, res) => {
    try {
        const order = await prisma.order.findFirst({
            where: { id: parseInt(req.params.id), userId: req.user.id }
        });

        if (!order) {
            return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
        }

        res.json(order);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;