const express = require('express');
const productController = require('../controllers/productController');

const router = express.Router();

router.get('/', productController.getAllProducts);
router.get('/:slug', productController.getProductBySlug);
router.delete('/:id', productController.deleteProduct);

module.exports = router;