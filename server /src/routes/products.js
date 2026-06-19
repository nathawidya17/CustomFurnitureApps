const express = require('express');
const router = express.Router();

const { PrismaClient } = require('@prisma/client');
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
// Ganti bagian GET /api/products/:slug menjadi ini:
router.get('/:slug', async (req, res) => {
  try {
    // 1. Decode URL (mengubah %20 jadi spasi)
    const slugDecoded = decodeURIComponent(req.params.slug);
    
    // 2. Gunakan findFirst agar lebih fleksibel dibanding findUnique jika ada spasi
    const product = await prisma.product.findFirst({ 
        where: { slug: slugDecoded } 
    });
    
    if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    res.json(product);
  } catch (e) { 
    console.error("Error Detail:", e); // Cek terminal lu, pasti pesannya lebih jelas
    res.status(500).json({ error: e.message }); 
  }
});

// DELETE /:id - Menghapus produk
router.delete('/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    // Cek dulu apakah produknya beneran ada di database
    const product = await prisma.product.findUnique({ 
        where: { id: productId } 
    });
    
    if (!product) {
        return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }

    // Eksekusi hapus pakai Prisma
    await prisma.product.delete({
      where: { id: productId }
    });
    
    res.json({ message: 'Produk berhasil dihapus' });
  } catch (e) { 
    console.error("Error Delete:", e);
    res.status(500).json({ error: e.message }); 
  }
});

module.exports = router;