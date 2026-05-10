import { prisma } from "../db";

async function main() {
  const currencies = [
    { code: "AFN", name: "Afghani" },
    { code: "USD", name: "US Dollar" },
    { code: "IRR", name: "Iranian Rial" },
    { code: "PKR", name: "Pakistani Rupee" },
    { code: "TOMAN", name: "Toman" },
  ] as const;

  for (const item of currencies) {
    await prisma.currency.upsert({
      where: { code: item.code },
      create: item,
      update: { name: item.name, isActive: true },
    });
  }

  const adminUsername = "admin";
  const existing = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (!existing) {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("admin123", 10);
    await prisma.user.create({
      data: {
        username: adminUsername,
        passwordHash: hash,
        role: "admin",
      },
    });
  }

  console.log("Seed completed. Default admin: admin / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

