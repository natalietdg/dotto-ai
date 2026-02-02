// schemas/UserSchema.ts - current production version

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: Date;
}

export type { User };
