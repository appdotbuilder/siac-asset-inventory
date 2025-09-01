import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput, type User } from '../schema';
import { eq } from 'drizzle-orm';

export async function createUser(input: CreateUserInput): Promise<User> {
  try {
    // Hash password (in real implementation, use bcrypt or similar)
    const hashedPassword = `hashed_${input.password}`;

    // Insert user record
    const result = await db.insert(usersTable)
      .values({
        email: input.email,
        password: hashedPassword,
        name: input.name,
        role: input.role,
      })
      .returning()
      .execute();

    const user = result[0];
    
    // Never return actual password
    return {
      ...user,
      password: '',
    };
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
}

export async function getUsers(): Promise<User[]> {
  try {
    const users = await db.select()
      .from(usersTable)
      .execute();

    // Never return actual passwords
    return users.map(user => ({
      ...user,
      password: '',
    }));
  } catch (error) {
    console.error('Get users failed:', error);
    throw error;
  }
}

export async function getUserById(id: number): Promise<User | null> {
  try {
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .execute();

    if (users.length === 0) {
      return null;
    }

    const user = users[0];
    
    // Never return actual password
    return {
      ...user,
      password: '',
    };
  } catch (error) {
    console.error('Get user by ID failed:', error);
    throw error;
  }
}

export async function updateUser(input: UpdateUserInput): Promise<User> {
  try {
    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date(),
    };

    if (input.email !== undefined) {
      updateData.email = input.email;
    }
    
    if (input.password !== undefined) {
      // Hash password (in real implementation, use bcrypt or similar)
      updateData.password = `hashed_${input.password}`;
    }
    
    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    
    if (input.role !== undefined) {
      updateData.role = input.role;
    }
    
    if (input.is_active !== undefined) {
      updateData.is_active = input.is_active;
    }

    // Update user record
    const result = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`User with ID ${input.id} not found`);
    }

    const user = result[0];
    
    // Never return actual password
    return {
      ...user,
      password: '',
    };
  } catch (error) {
    console.error('User update failed:', error);
    throw error;
  }
}

export async function deleteUser(id: number): Promise<boolean> {
  try {
    // Soft delete by setting is_active to false
    const result = await db.update(usersTable)
      .set({ 
        is_active: false,
        updated_at: new Date(),
      })
      .where(eq(usersTable.id, id))
      .returning()
      .execute();

    return result.length > 0;
  } catch (error) {
    console.error('User deletion failed:', error);
    throw error;
  }
}