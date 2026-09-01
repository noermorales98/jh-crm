/** Verifica que BOOTSTRAP_OWNER_PASSWORD coincida con el hash del OWNER (sin imprimirla). */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] ?? "admin@jhmultiservices.com";
  const pw = process.env.BOOTSTRAP_OWNER_PASSWORD ?? "";
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: true },
  });
  console.log("user existe:", !!user, "| activo:", user?.isActive, "| memberships:", user?.memberships.length);
  console.log("pw length:", pw.length, "| comillas envolventes:", /^"|"$/.test(pw));
  if (user) {
    console.log("bcrypt match:", await bcrypt.compare(pw, user.passwordHash));
    const trimmed = pw.replace(/^"|"$/g, "");
    if (trimmed !== pw) {
      console.log("bcrypt match sin comillas:", await bcrypt.compare(trimmed, user.passwordHash));
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
