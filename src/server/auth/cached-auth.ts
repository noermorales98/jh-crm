import { cache } from "react";
import { auth as nextAuth } from "@/auth";

/**
 * Deduplica auth() dentro del mismo request RSC
 * (layout CRM + page + requireOrganization/requirePermission).
 */
export const getAuth = cache(() => nextAuth());
