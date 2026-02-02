// schemas/UserSchema.ts - current production version

interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
}

export type { User };
