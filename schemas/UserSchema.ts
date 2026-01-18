// User Schema - v1.1 (minor breaking changes)
export interface User {
  id: string;
  email: string;
  displayName: string;  // BREAKING: renamed from name
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'inactive' | 'suspended';  // BREAKING: changed from isActive boolean
  role: 'user' | 'admin' | 'moderator' | 'support';  // Added new enum value
  profile?: UserProfile;
  customerId?: string;  // NEW: links to payment system
}

export interface UserProfile {
  avatarUrl?: string;  // renamed from avatar
  bio?: string;
  location?: string;
  socialLinks?: SocialLinks;  // NEW: replaced website with object
}

export interface SocialLinks {
  website?: string;
  twitter?: string;
  linkedin?: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';  // Added new enum value
  notifications: NotificationSettings;  // BREAKING: changed from boolean to object
  language: string;
  timezone?: string;  // NEW optional field
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
}
