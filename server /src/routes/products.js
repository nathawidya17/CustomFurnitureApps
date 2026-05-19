const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where:   { isActive: true },
      orderBy: { id: 'asc' },
      select:  { id: true, slug: true, name: true, basePrice: true, description: true, modelFile: true, thumbnail: true },
    });
    res.json(products);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/products/:slug
router.get('/:slug', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { slug: req.params.slug } });
    if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    res.json(product);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;