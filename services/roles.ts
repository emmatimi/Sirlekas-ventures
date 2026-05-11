import { UserRole } from "../types";

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || "")
  .split(",")
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean);

export const getRoleForEmail = (email?: string | null): UserRole => {
  if (!email) return "student";
  return ADMIN_EMAILS.includes(email.trim().toLowerCase()) ? "admin" : "student";
};
