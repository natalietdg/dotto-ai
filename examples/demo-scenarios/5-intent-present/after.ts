// schemas/UserSchema.ts - added login tracking
// @intent Add lastLoginAt for security monitoring and session management

interface User {
  id: string;
  email: string;
  displayName: string;
  lastLoginAt?: Date;
  createdAt: Date;
}

export type { User };
