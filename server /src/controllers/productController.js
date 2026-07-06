const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getAllProducts = async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where:   { isActive: true },
      orderBy: { id: 'asc' },
      select:  { id: true, slug: true, name: true, basePrice: true, description: true, modelFile: true, thumbnail: true },
    });
    res.json(products);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const getProductBySlug = async (req, res) => {
  try {
    const slugDecoded = decodeURIComponent(req.params.slug);
    const product = await prisma.product.findFirst({ where: { slug: slugDecoded } });
    
    if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    res.json(product);
  } catch (e) { 
    console.error("Error Detail:", e);
    res.status(500).json({ error: e.message }); 
  }
};

const deleteProduct = async (req, res) => {
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
};

module.exports = { getAllProducts, getProductBySlug, deleteProduct };