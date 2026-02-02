// schemas/UserSchema.ts - added preferences
// @intent Add optional preferences field for user personalization

interface UserPreferences {
  theme: "light" | "dark" | "system";
  language: string;
  notifications: boolean;
}

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  preferences?: UserPreferences;
  createdAt: Date;
}

export type { User, UserPreferences };
