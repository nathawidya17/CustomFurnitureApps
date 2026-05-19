const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, adminOnly } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

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
    const { status, adminNotes } = req.body;
    const valid = ['PENDING','WAITING_APPROVAL','APPROVED','REJECTED','IN_PRODUCTION','DONE'];
    if (!valid.includes(status))
      return res.status(400).json({ error: 'Status tidak valid' });

    const order = await prisma.order.update({
      where: { id: parseInt(req.params.id) },
      data:  { status, adminNotes },
    });
    res.json({ message: 'Status diupdate', order });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

module.exports = router;