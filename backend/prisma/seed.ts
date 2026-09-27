import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // This seeder creates a SUPER_ADMIN and demo shop with known credentials, which
  // is fine locally and unacceptable against a live database. Refuse outright in
  // production rather than trusting whoever ran it to have meant it.
  if (process.env.NODE_ENV === 'production') {
    console.error(
      'Refusing to seed: NODE_ENV is production.\n' +
      'This seeder creates accounts with a known password and demo data.\n' +
      'To create the platform owner in production, set SUPER_ADMIN_PASSWORD and start the app.',
    );
    process.exit(1);
  }

  console.log('🌱 Starting seed...');

  // 1. Create Admin User. SUPER_ADMIN_PASSWORD overrides the local default.
  const seedPassword = process.env.SUPER_ADMIN_PASSWORD?.trim() || 'password';
  const hashedPassword = await bcrypt.hash(seedPassword, 10);

  const admin = await prisma.user.upsert({
    where: { phone: '+919999999999' },
    update: {},
    create: {
      phone: '+919999999999',
      email: 'admin@cafeos.com',
      password: hashedPassword,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`✅ Admin user created: ${admin.email}`);

  // 2. Create Default Shop
  const shop = await prisma.shop.upsert({
    where: { slug: 'cafe-noir' },
    update: {},
    create: {
      name: 'Café Noir',
      slug: 'cafe-noir',
      address: '123, Coffee Street, Indiranagar, Bangalore',
      phone: '+91 98765 43210',
      currency: '₹',
      themeColor: '#BF5700',
      upiId: 'cafenoir@upi',
    },
  });
  console.log(`✅ Shop created: ${shop.name}`);

  // 3. Create Shop Owner
  const owner = await prisma.user.upsert({
    where: { phone: '+919876543210' },
    update: {},
    create: {
      phone: '+919876543210',
      email: 'owner@cafenoir.com',
      password: hashedPassword,
      name: 'Raj Kumar',
      role: 'CAFE_OWNER',
      shopId: shop.id,
    },
  });
  console.log(`✅ Owner created: ${owner.email}`);

  // 4. Create Cashier
  const cashier = await prisma.user.upsert({
    where: { phone: '+919876543211' },
    update: {},
    create: {
      phone: '+919876543211',
      email: 'cashier@cafenoir.com',
      password: hashedPassword,
      name: 'Priya Sharma',
      role: 'CASHIER',
      shopId: shop.id,
    },
  });
  console.log(`✅ Cashier created: ${cashier.email}`);

  // 5. Check if categories already exist
  const existingCategories = await prisma.menuCategory.count({
    where: { shopId: shop.id },
  });

  if (existingCategories === 0) {
    // 6. Create Categories with Items
    const categories = [
      { name: 'Signature Coffee', sortOrder: 1 },
      { name: 'Iced Classics', sortOrder: 2 },
      { name: 'Artisan Bakery', sortOrder: 3 },
      { name: 'Savory Bites', sortOrder: 4 },
    ];

    for (const cat of categories) {
      await prisma.menuCategory.create({
        data: {
          name: cat.name,
          sortOrder: cat.sortOrder,
          shopId: shop.id,
          items: {
            create: getItemsForCategory(cat.name),
          },
        },
      });
    }
    console.log('✅ Menu categories and items created');
  } else {
    console.log('ℹ️ Menu already exists, skipping...');
  }

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📝 Login credentials:');
  console.log('   Admin: admin@cafeos.com / password');
  console.log('   Owner: owner@cafenoir.com / password');
  console.log('   Cashier: cashier@cafenoir.com / password');
}

function getItemsForCategory(categoryName: string) {
  switch (categoryName) {
    case 'Signature Coffee':
      return [
        { name: 'Espresso Romano', price: 180, description: 'Single shot with a twist of lemon zest.', image: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=300&q=80', popularityScore: 85 },
        { name: 'Hazelnut Cappuccino', price: 240, description: 'Rich espresso with steamed milk and hazelnut syrup.', image: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=300&q=80', popularityScore: 95 },
        { name: 'Flat White', price: 220, description: 'Smooth microfoam over a double shot of espresso.', image: 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?auto=format&fit=crop&w=300&q=80', popularityScore: 90 },
        { name: 'Mocha Latte', price: 260, description: 'Espresso with chocolate and steamed milk.', image: 'https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?auto=format&fit=crop&w=300&q=80', popularityScore: 88 },
      ];
    case 'Iced Classics':
      return [
        { name: 'Vietnamese Cold Brew', price: 260, description: 'Slow-dripped coffee with sweetened condensed milk.', image: 'https://images.unsplash.com/photo-1517701604599-bb29b5c7fa69?auto=format&fit=crop&w=300&q=80', popularityScore: 92 },
        { name: 'Iced Americano', price: 190, description: 'Espresso shots topped with cold water and ice.', image: 'https://images.unsplash.com/photo-1517959105821-eaf2591984ca?auto=format&fit=crop&w=300&q=80', popularityScore: 80 },
        { name: 'Caramel Frappé', price: 290, description: 'Blended ice, coffee, milk, and caramel drizzle.', image: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=300&q=80', popularityScore: 98 },
      ];
    case 'Artisan Bakery':
      return [
        { name: 'Almond Croissant', price: 210, description: 'Buttery pastry filled with almond cream.', image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=300&q=80', popularityScore: 88 },
        { name: 'Blueberry Muffin', price: 160, description: 'Freshly baked with organic blueberries.', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80', popularityScore: 75 },
        { name: 'Chocolate Brownie', price: 180, description: 'Rich, fudgy chocolate brownie.', image: 'https://images.unsplash.com/photo-1564355808539-22fda35bed7e?auto=format&fit=crop&w=300&q=80', popularityScore: 82 },
      ];
    case 'Savory Bites':
      return [
        { name: 'Avocado Toast', price: 320, description: 'Sourdough toast topped with smashed avocado and chili flakes.', image: 'https://images.unsplash.com/photo-1588137372308-15f75323ca8d?auto=format&fit=crop&w=300&q=80', popularityScore: 94 },
        { name: 'Grilled Cheese Panini', price: 280, description: 'Three-cheese blend with herbs on ciabatta.', image: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=300&q=80', popularityScore: 89 },
        { name: 'Chicken Wrap', price: 350, description: 'Grilled chicken with fresh veggies in tortilla.', image: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=300&q=80', popularityScore: 86 },
      ];
    default:
      return [];
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
