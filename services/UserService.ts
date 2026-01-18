// User Service - v1.0
import { User, UserProfile, UserPreferences } from '../schemas/UserSchema';

export interface CreateUserRequest {
  email: string;
  name: string;
  role?: 'user' | 'admin' | 'moderator';
}

export interface UpdateUserRequest {
  name?: string;
  profile?: Partial<UserProfile>;
  isActive?: boolean;
}

export class UserService {
  private users: Map<string, User> = new Map();
  private preferences: Map<string, UserPreferences> = new Map();

  async createUser(request: CreateUserRequest): Promise<User> {
    const { email, name, role = 'user' } = request;

    // Check if email already exists
    const existingUser = Array.from(this.users.values())
      .find(u => u.email === email);
    if (existingUser) {
      throw new Error('Email already registered');
    }

    const user: User = {
      id: `user_${Date.now()}`,
      email,
      name,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      role,
    };

    this.users.set(user.id, user);

    // Set default preferences
    this.preferences.set(user.id, {
      theme: 'light',
      notifications: true,
      language: 'en',
    });

    return user;
  }

  async getUser(userId: string): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return Array.from(this.users.values())
      .find(u => u.email === email) || null;
  }

  async updateUser(userId: string, updates: UpdateUserRequest): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user) return null;

    if (updates.name) user.name = updates.name;
    if (updates.isActive !== undefined) user.isActive = updates.isActive;
    if (updates.profile) {
      user.profile = { ...user.profile, ...updates.profile };
    }
    user.updatedAt = new Date();

    return user;
  }

  async deactivateUser(userId: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;
    user.isActive = false;
    user.updatedAt = new Date();
    return true;
  }

  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    return this.preferences.get(userId) || null;
  }
}
