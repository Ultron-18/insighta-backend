const prisma = require('./src/lib/prisma');

async function main() {
  const user = await prisma.user.updateMany({
    where: { username: 'Ultron-18' },
    data: { role: 'admin' },
  });
  console.log('Updated:', user);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());