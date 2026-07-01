const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.post('/register', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        if (!name || !email || !phone || !password)
            return res.status(400).json({ error: 'Semua field wajib diisi' });

        if (await prisma.user.findUnique({ where: { email } }))
            return res.status(400).json({ error: 'Email sudah terdaftar' });

        const hashed = await bcrypt.hash(password, 10);
        const user   = await prisma.user.create({
            data: { name, email, phone, password: hashed },
        });
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET, { expiresIn: '7d' }
        );

        // ✅ tambahkan phone di response
        res.status(201).json({
            token,
            user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !(await bcrypt.compare(password, user.password)))
            return res.status(401).json({ error: 'Email atau password salah' });

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET, { expiresIn: '7d' }
        );

        res.json({
            token,
            user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where:  { id: req.user.id },
            select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
        });
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;