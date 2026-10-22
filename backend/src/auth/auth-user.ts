import type { Role } from '../generated/prisma/client.js';

/** The authenticated principal attached to a request. Never contains the password hash. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  managerId: string | null;
  /** An admin reset this password: only changing it is allowed until the user does. */
  mustChangePassword: boolean;
}

export const authUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  managerId: true,
  mustChangePassword: true,
} as const;
