import { z } from "zod";

export const AuthRoleSchema = z.enum(["guest", "admin", "superadmin"]);
export type AuthRole = z.infer<typeof AuthRoleSchema>;

export const PrivilegedRoleSchema = z.enum(["admin", "superadmin"]);
export type PrivilegedRole = z.infer<typeof PrivilegedRoleSchema>;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  jobTitle: string;
  role: PrivilegedRole;
  passwordHash: string;
  passwordAlgo: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  versionId: string;
  action: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  jobTitle: string;
  role: AuthRole;
}

export const GUEST_USER: SessionUser = {
  id: "guest",
  email: "",
  name: "Guest",
  jobTitle: "",
  role: "guest",
};

export function canComposeDigest(user: SessionUser): boolean {
  return user.role === "admin" || user.role === "superadmin";
}

export function isSuperadmin(user: SessionUser): boolean {
  return user.role === "superadmin";
}
