const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, adminOnly } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ── HELPER WA WABLAS (PADAT) ──────────────────────────────────
const formatNoWA = (no) => no?.startsWith('0') ? '62' + no.slice(1) : no;
const sendWA = async (target, message) => {
  try {
    const domain = 'https://smg.wablas.com'; 
    const token  = 'oFdcnXbhislmPc9sNIcMeugzMpBZpK1nkqRpWgtz057NSJKKyLlgW5v';  // <-- Isi API Token dari Wablas
    const secret = 'av7Ev3Ib'; // <-- Isi Secret Key dari Wablas
    
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

// GET /api/admin/stats
router.get('/stats', authenticate, adminOnly, async (req, res) => {
  try {
    const [total, pending, waiting, approved, inProd, done] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { status: 'WAITING_APPROVAL' } }),
      prisma.order.count({ where: { status: 'APPROVED' } }),
      prisma.order.count({ where: { status: 'IN_PRODUCTION' } }),
      prisma.order.count({ where: { status: 'DONE' } }),
    ]);
    const revenue = await prisma.order.aggregate({
      where: { status: { in: ['APPROVED', 'IN_PRODUCTION', 'DONE'] } },
      _sum:  { totalPrice: true },
    });
    res.json({ total, pending, waiting, approved, inProd, done, revenue: revenue._sum.totalPrice || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/orders
router.get('/orders', authenticate, adminOnly, async (req, res) => {
  try {
    const { status, search } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search) where.OR = [
      { orderCode: { contains: search } },
      { user: { name: { contains: search } } },
    ];
    const orders = await prisma.order.findMany({
      where,
      include: { user: { select: { name: true, email: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/orders/:id/status
router.patch('/orders/:id/status', authenticate, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['PENDING','WAITING_APPROVAL','APPROVED','REJECTED','IN_PRODUCTION','DONE'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Status tidak valid' });

    // 1. Update Database
    const order = await prisma.order.update({
      where: { id: parseInt(req.params.id) },
      data:  { status },
    });

    // 2. Trigger Notifikasi WA (JANGAN DI-AWAIT agar tidak memblokir respon)
    if (order.customerPhone) {
      const mapPesan = {
        WAITING_APPROVAL: 'sedang *DIVERIFIKASI* oleh admin.',
        APPROVED:         '*DITERIMA* & pembayaran valid.',
        IN_PRODUCTION:    'sedang *DALAM PROSES PRODUKSI* oleh tukang kayu kami.',
        DONE:             '*SELESAI* diproduksi & sedang dalam pengiriman!',
        REJECTED:         '*DITOLAK*. Mohon hubungi admin untuk informasi lebih lanjut.'
      };
      const teksStatus = mapPesan[status] || `diperbarui menjadi *${status}*`;
      const pesan = `Halo Kak *${order.customerName}*,\n\nStatus pesanan Anda (*${order.orderCode}*) ${teksStatus}\n\nTerima kasih — *Debbi Meubel*`;
      
      // Panggil tanpa 'await' agar proses API Fonnte berjalan di latar belakang
      sendWA(formatNoWA(order.customerPhone), pesan).catch(err => console.error('Background WA Error:', err));
    }

    // 3. Respon sukses ke frontend tetap terkirim walaupun WA gagal
    res.json({ message: 'Status diupdate', order });
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// GET /api/admin/products
router.get('/products', authenticate, adminOnly, async (req, res) => {
  try {
    const products = await prisma.product.findMany({ orderBy: { id: 'asc' } });
    res.json(products);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/products
router.post('/products', authenticate, adminOnly, async (req, res) => {
  try {
    const { slug, name, basePrice, description, modelFile, thumbnail } = req.body;
    if (!slug || !name || !basePrice)
      return res.status(400).json({ error: 'slug, name, basePrice wajib diisi' });

    const product = await prisma.product.create({
      data: { slug, name, basePrice: parseInt(basePrice), description, modelFile, thumbnail },
    });
    res.status(201).json(product);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/products/:id
router.patch('/products/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { name, basePrice, description, modelFile, thumbnail, isActive } = req.body;
    const product = await prisma.product.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(name        !== undefined && { name }),
        ...(basePrice   !== undefined && { basePrice: parseInt(basePrice) }),
        ...(description !== undefined && { description }),
        ...(modelFile   !== undefined && { modelFile }),
        ...(thumbnail   !== undefined && { thumbnail }),
        ...(isActive    !== undefined && { isActive }),
      },
    });
    res.json(product);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /products/:id - Menghapus produk (Admin Only)
router.delete('/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });

    await prisma.product.delete({ where: { id: productId } });
    res.json({ message: 'Produk berhasil dihapus' });
  } catch (e) { 
    console.error("Error Delete:", e);
    res.status(500).json({ error: e.message }); 
  }
});

module.exports = router;