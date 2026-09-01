import { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      currentOrganizationId: string | null;
      role: Role | null;
    } & DefaultSession["user"];
  }

  interface User {
    currentOrganizationId?: string | null;
    role?: Role | null;
  }
}

// next-auth/jwt re-exporta con `export *`: la augmentación debe aplicarse
// al módulo original para que el merge de la interfaz JWT funcione.
declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string;
    currentOrganizationId?: string | null;
    role?: Role | null;
  }
}
