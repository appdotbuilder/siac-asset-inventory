import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginInput, type User } from '../schema';
import { eq, and } from 'drizzle-orm';

export const login = async (input: LoginInput): Promise<User> => {
  try {
    // Find user by email and password
    const results = await db.select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.email, input.email),
          eq(usersTable.password, input.password), // In real app, this would be hashed
          eq(usersTable.is_active, true)
        )
      )
      .execute();

    if (results.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = results[0];

    // Return user without password for security
    return {
      id: user.id,
      email: user.email,
      password: '', // Never return actual password
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
};

export const getCurrentUser = async (userId: number): Promise<User | null> => {
  try {
    const results = await db.select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, userId),
          eq(usersTable.is_active, true)
        )
      )
      .execute();

    if (results.length === 0) {
      return null;
    }

    const user = results[0];

    // Return user without password for security
    return {
      id: user.id,
      email: user.email,
      password: '', // Never return actual password
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  } catch (error) {
    console.error('Get current user failed:', error);
    throw error;
  }
};