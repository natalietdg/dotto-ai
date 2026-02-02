// User Schema - v1.1 (minor breaking changes)
export interface User {
  id: string;
  email: string;
  displayName: string; // BREAKING: renamed from name
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  role: "user" | "admin" | "moderator";
  profile?: UserProfile;
  customerId?: string; // NEW: links to payment system
}

export interface UserProfile {
  avatarUrl?: string; // renamed from avatar
  bio?: string;
  location?: string;
  socialLinks?: SocialLinks; // NEW: replaced website with object
}

export interface SocialLinks {
  website?: string;
  twitter?: string;
  linkedin?: string;
}

export interface UserPreferences {
  theme: "light" | "dark";
  notifications: boolean;
  language: string;
  timezone?: string; // NEW optional field
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
}
