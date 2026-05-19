const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "mysql://root:@127.0.0.1:3306/furniture_db"
        }
    }
});

async function main() {
    const hashed = await bcrypt.hash('admin123', 10);
    await prisma.user.upsert({
        where:  { email: 'admin@furniture.com' },
        update: {},
        create: {
            name: 'Admin', 
            email: 'admin@furniture.com',
            phone: '08123456789', 
            password: hashed, 
            role: 'ADMIN',
        },
    });

    const products = [
        { slug: 'hiro drawer 2 ST',            name: 'Hiro Drawer',       basePrice: 320000,  modelFile: 'frame-hiro-drawer.glb' },
        { slug: 'hiro 2 rak 2 drawer ', name: 'Hiro Rak 2 Drawer', basePrice: 400000,  modelFile: 'framebawahhirorak2drawer.glb' },
        { slug: 'rak serbaguna',            name: 'Rak Serbaguna',     basePrice: 300000,  modelFile: 'rakfix.glb' },
        { slug: 'lemari 2 pintu',          name: 'Lemari 2 pintu',      basePrice: 632000,  modelFile: 'framelemari2pintubiasa.glb' },
        { slug: 'lemari2 pintu kaca masuk',         name: 'Lemari 2 Pintu Kaca Masuk',    basePrice: 632000, modelFile: 'framelemari2pintu.glb' },
        { slug: 'lemari kabinet',         name: 'Lemari Kabinet',    basePrice: 240000, modelFile: 'frame-lemari-kabinet.glb' }
    ];

    for (const p of products) {
        await prisma.product.upsert({
            where:  { slug: p.slug },
            update: { name: p.name, basePrice: p.basePrice },
            create: p,
        });
    }

    console.log('✅ Seed selesai');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());