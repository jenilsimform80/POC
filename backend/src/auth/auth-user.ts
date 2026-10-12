import type { Role } from '../generated/prisma/client.js';

/** The authenticated principal attached to a request. Never contains the password hash. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  managerId: string | null;
}

export const authUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  managerId: true,
} as const;
