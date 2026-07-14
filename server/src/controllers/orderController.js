const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

// ── KONFIGURASI MULTER & HELPER FILE ──────────────────────────
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const ALLOWED_MIMETYPES  = ['image/png', 'image/jpeg'];

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'payment-' + unique + (file.mimetype === 'image/png' ? '.png' : '.jpg'));
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIMETYPES.includes(file.mimetype)) {
            return cb(new Error('Hanya file gambar PNG, JPG, atau JPEG yang diperbolehkan.'));
        }
        cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

const isValidImageSignature = (filePath) => {
    const buffer = fs.readFileSync(filePath, { encoding: null, flag: 'r' }).subarray(0, 8);
    return (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) || 
           (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff);
};

const generateOrderCode = () => {
    const d = new Date();
    const ymd = d.getFullYear().toString().slice(-2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
    return `ORD-${ymd}-${Math.random().toString(36).substr(2,5).toUpperCase()}`;
};

// ── HELPER WA WABLAS ──────────────────────────────────────────
const formatNoWA = (no) => no?.startsWith('0') ? '62' + no.slice(1) : no;
const sendWA = async (target, message) => {
  try {
    const domain = 'https://smg.wablas.com'; 
    const token  = 'oFdcnXbhislmPc9sNIcMeugzMpBZpK1nkqRpWgtz057NSJKKyLlgW5v';  
    const secret = 'av7Ev3Ib'; 
    
    await fetch(`${domain}/api/send-message`, {
      method: 'POST',
      headers: { 'Authorization': `${token}.${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: target, message })
    }).catch(e => console.error('Error Wablas:', e));
  } catch (e) { console.error('Error:', e.message); }
};

// ── MIDDLEWARE KHUSUS UPLOAD ──────────────────────────────────
const handleUpload = (req, res, next) => {
    upload.single('proof')(req, res, async (err) => {
        if (err) {
            if (req.params.id) {
                try { await prisma.order.delete({ where: { id: parseInt(req.params.id) } }); } 
                catch (e) { /* abaikan */ }
            }
            return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file maksimal 5MB.' : err.message });
        }
        next();
    });
};

// ── LOGIKA CONTROLLER UTAMA ─────────────────
const createOrder = async (req, res) => {
    try {
        const { productName, productId, config, totalPrice, finishing, customerName, customerPhone, customerEmail, customerAddress } = req.body;
        
        let parsedConfig = typeof config === 'string' ? JSON.parse(config || '{}') : (config || {});
        
        if (finishing) {
            parsedConfig.finishing = finishing;
        }

        const order = await prisma.order.create({
            data: {
                orderCode: generateOrderCode(), 
                userId: req.user.id, 
                productId: parseInt(productId) || 1,
                productName, 
                config: JSON.stringify(parsedConfig), 
                totalPrice: parseInt(totalPrice), 
                status: 'PENDING',
                customerName, customerPhone, customerEmail, customerAddress
            }
        });

        const pesanAdmin = `🚨 *Pesanan Baru Masuk!*\nKode: ${order.orderCode}\nNama: ${customerName}\nItem: ${productName}\nTotal: Rp${totalPrice}\n\nMohon segera dicek di Dashboard.`;
        sendWA('62895396157579', pesanAdmin).catch(()=>{});

        const pesanPelanggan = `Halo Kak *${customerName}*,\n\nTerima kasih telah berbelanja di *Debbi Meubel*. Pesanan Anda dengan kode *${order.orderCode}* telah kami terima.\n\nTotal Pembayaran: *Rp${totalPrice}*\nStatus: *MENUNGGU VERIFIKASI*\n\nAdmin akan segera memverifikasi pesanan Anda. Terima kasih!`;
        sendWA(formatNoWA(customerPhone), pesanPelanggan).catch(()=>{});

        res.json({ message: 'Pesanan berhasil dibuat', order });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

const uploadPayment = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan.' });
        const filePath = path.join('uploads', req.file.filename);

        if (!isValidImageSignature(filePath)) {
            fs.unlinkSync(filePath);
            await prisma.order.delete({ where: { id: parseInt(req.params.id) } });
            return res.status(400).json({ error: 'File tidak valid atau rusak.' });
        }

        const order = await prisma.order.findFirst({ where: { id: parseInt(req.params.id), userId: req.user.id } });
        if (!order) {
            fs.unlinkSync(filePath);
            return res.status(404).json({ error: 'Pesanan tidak ditemukan atau bukan milik Anda.' });
        }

        await prisma.order.update({ where: { id: order.id }, data: { paymentProof: req.file.filename, status: 'WAITING_APPROVAL' } });
        res.json({ message: 'Bukti bayar berhasil diupload' });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

const getMyOrders = async (req, res) => {
    try {
        const orders = await prisma.order.findMany({
             where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            include: {product: true}
         });

        res.json(orders);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

const getOrderById = async (req, res) => {
    try {
        const order = await prisma.order.findFirst({ where: { id: parseInt(req.params.id), userId: req.user.id } });
        if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
        res.json(order);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

module.exports = { handleUpload, createOrder, uploadPayment, getMyOrders, getOrderById };