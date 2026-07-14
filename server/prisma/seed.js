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
        { slug: 'hiro drawer 2 ST',            name: 'Hiro Drawer',size : '438 x 395 x 620',       basePrice: 320000,  modelFile: 'frame-hiro-drawer.glb', thumbnail: 'hiro drawer 2 st.webp' },
        { slug: 'hiro 2 rak 2 drawer ', name: 'Hiro Rak 2 Drawer', size: '450 x 395 x 1800', basePrice: 400000,  modelFile: 'framebawahhirorak2drawer.glb', thumbnail: 'hiro tinggi.webp' },
        { slug: 'rak serbaguna',            name: 'Rak Serbaguna',     size: '1125 x 295 x 1125', basePrice: 300000,  modelFile: 'rakfix.glb', thumbnail: 'rak buku serbaguna.jpg' },
        { slug: 'lemari 2 pintu',          name: 'Lemari 2 pintu',      size: '800 x 430 x 1809', basePrice: 632000,  modelFile: 'framelemari2pintubiasa.glb', thumbnail: 'lemari 2 pintu.png' },
        { slug: 'lemari2 pintu kaca masuk',         name: 'Lemari 2 Pintu Kaca Masuk',    size: '800 x 430 x 1809', basePrice: 632000, modelFile: 'framelemari2pintu.glb', thumbnail: 'lemari2 pintu kaca masuk.png' },
        { slug: 'lemari kabinet',         name: 'Lemari Kabinet',    size: '400 x 300 x 1200', basePrice: 240000, modelFile: 'frame-lemari-kabinet.glb', thumbnail: 'lemari kabinet.webp' }
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