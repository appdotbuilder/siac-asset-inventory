import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput } from '../schema';
import { createUser, getUsers, getUserById, updateUser, deleteUser } from '../handlers/users';
import { eq } from 'drizzle-orm';

// Test inputs
const testUserInput: CreateUserInput = {
  email: 'test@example.com',
  password: 'password123',
  name: 'Test User',
  role: 'karyawan',
};

const adminUserInput: CreateUserInput = {
  email: 'admin@example.com',
  password: 'adminpass',
  name: 'Admin User',
  role: 'admin',
};

describe('Users Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createUser', () => {
    it('should create a user with default role', async () => {
      const input: CreateUserInput = {
        email: 'new@example.com',
        password: 'newpass',
        name: 'New User',
        role: 'karyawan',
      };

      const result = await createUser(input);

      // Basic field validation
      expect(result.email).toEqual('new@example.com');
      expect(result.name).toEqual('New User');
      expect(result.role).toEqual('karyawan');
      expect(result.is_active).toEqual(true);
      expect(result.password).toEqual(''); // Should not return password
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create admin user', async () => {
      const result = await createUser(adminUserInput);

      expect(result.email).toEqual('admin@example.com');
      expect(result.name).toEqual('Admin User');
      expect(result.role).toEqual('admin');
      expect(result.is_active).toEqual(true);
      expect(result.password).toEqual('');
    });

    it('should save user to database with hashed password', async () => {
      const result = await createUser(testUserInput);

      // Query database directly
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].email).toEqual('test@example.com');
      expect(users[0].name).toEqual('Test User');
      expect(users[0].role).toEqual('karyawan');
      expect(users[0].is_active).toEqual(true);
      expect(users[0].password).toEqual('hashed_password123'); // Should be hashed
      expect(users[0].created_at).toBeInstanceOf(Date);
    });

    it('should reject duplicate email', async () => {
      await createUser(testUserInput);

      const duplicateInput: CreateUserInput = {
        ...testUserInput,
        name: 'Another User',
      };

      await expect(createUser(duplicateInput)).rejects.toThrow();
    });
  });

  describe('getUsers', () => {
    it('should return empty array when no users exist', async () => {
      const result = await getUsers();
      expect(result).toEqual([]);
    });

    it('should return all users without passwords', async () => {
      // Create test users
      const user1 = await createUser(testUserInput);
      const user2 = await createUser(adminUserInput);

      const result = await getUsers();

      expect(result).toHaveLength(2);
      
      // Check first user
      const foundUser1 = result.find(u => u.id === user1.id);
      expect(foundUser1).toBeDefined();
      expect(foundUser1!.email).toEqual('test@example.com');
      expect(foundUser1!.name).toEqual('Test User');
      expect(foundUser1!.role).toEqual('karyawan');
      expect(foundUser1!.password).toEqual(''); // No password returned
      
      // Check second user
      const foundUser2 = result.find(u => u.id === user2.id);
      expect(foundUser2).toBeDefined();
      expect(foundUser2!.email).toEqual('admin@example.com');
      expect(foundUser2!.role).toEqual('admin');
      expect(foundUser2!.password).toEqual('');
    });

    it('should include inactive users', async () => {
      const user = await createUser(testUserInput);
      await deleteUser(user.id); // Soft delete

      const result = await getUsers();
      expect(result).toHaveLength(1);
      expect(result[0].is_active).toEqual(false);
    });
  });

  describe('getUserById', () => {
    it('should return null for non-existent user', async () => {
      const result = await getUserById(999);
      expect(result).toBeNull();
    });

    it('should return user by ID without password', async () => {
      const user = await createUser(testUserInput);

      const result = await getUserById(user.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(user.id);
      expect(result!.email).toEqual('test@example.com');
      expect(result!.name).toEqual('Test User');
      expect(result!.role).toEqual('karyawan');
      expect(result!.is_active).toEqual(true);
      expect(result!.password).toEqual(''); // No password returned
      expect(result!.created_at).toBeInstanceOf(Date);
    });

    it('should return inactive user', async () => {
      const user = await createUser(testUserInput);
      await deleteUser(user.id); // Soft delete

      const result = await getUserById(user.id);
      expect(result).not.toBeNull();
      expect(result!.is_active).toEqual(false);
    });
  });

  describe('updateUser', () => {
    it('should update user email', async () => {
      const user = await createUser(testUserInput);

      const updateInput: UpdateUserInput = {
        id: user.id,
        email: 'updated@example.com',
      };

      const result = await updateUser(updateInput);

      expect(result.id).toEqual(user.id);
      expect(result.email).toEqual('updated@example.com');
      expect(result.name).toEqual('Test User'); // Unchanged
      expect(result.role).toEqual('karyawan'); // Unchanged
      expect(result.password).toEqual(''); // No password returned
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should update user name and role', async () => {
      const user = await createUser(testUserInput);

      const updateInput: UpdateUserInput = {
        id: user.id,
        name: 'Updated Name',
        role: 'admin',
      };

      const result = await updateUser(updateInput);

      expect(result.id).toEqual(user.id);
      expect(result.email).toEqual('test@example.com'); // Unchanged
      expect(result.name).toEqual('Updated Name');
      expect(result.role).toEqual('admin');
      expect(result.password).toEqual('');
    });

    it('should update user password', async () => {
      const user = await createUser(testUserInput);

      const updateInput: UpdateUserInput = {
        id: user.id,
        password: 'newpassword',
      };

      const result = await updateUser(updateInput);

      expect(result.password).toEqual(''); // Still no password returned

      // Check database directly
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .execute();

      expect(users[0].password).toEqual('hashed_newpassword'); // Should be hashed
    });

    it('should update user active status', async () => {
      const user = await createUser(testUserInput);

      const updateInput: UpdateUserInput = {
        id: user.id,
        is_active: false,
      };

      const result = await updateUser(updateInput);

      expect(result.is_active).toEqual(false);
    });

    it('should update multiple fields at once', async () => {
      const user = await createUser(testUserInput);

      const updateInput: UpdateUserInput = {
        id: user.id,
        name: 'Multi Update',
        role: 'admin',
        is_active: false,
      };

      const result = await updateUser(updateInput);

      expect(result.name).toEqual('Multi Update');
      expect(result.role).toEqual('admin');
      expect(result.is_active).toEqual(false);
      expect(result.email).toEqual('test@example.com'); // Unchanged
    });

    it('should save updates to database', async () => {
      const user = await createUser(testUserInput);

      const updateInput: UpdateUserInput = {
        id: user.id,
        name: 'Database Update',
      };

      await updateUser(updateInput);

      // Check database directly
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].name).toEqual('Database Update');
      expect(users[0].updated_at).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent user', async () => {
      const updateInput: UpdateUserInput = {
        id: 999,
        name: 'Non-existent',
      };

      await expect(updateUser(updateInput)).rejects.toThrow(/not found/i);
    });

    it('should reject duplicate email', async () => {
      const user1 = await createUser(testUserInput);
      const user2 = await createUser(adminUserInput);

      const updateInput: UpdateUserInput = {
        id: user2.id,
        email: user1.email, // Try to use existing email
      };

      await expect(updateUser(updateInput)).rejects.toThrow();
    });
  });

  describe('deleteUser', () => {
    it('should soft delete user (set is_active to false)', async () => {
      const user = await createUser(testUserInput);

      const result = await deleteUser(user.id);

      expect(result).toBe(true);

      // Check user is still in database but inactive
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].is_active).toEqual(false);
      expect(users[0].updated_at).toBeInstanceOf(Date);
    });

    it('should return true for already inactive user', async () => {
      const user = await createUser(testUserInput);
      
      // Delete once
      await deleteUser(user.id);
      
      // Delete again
      const result = await deleteUser(user.id);
      
      expect(result).toBe(true);
    });

    it('should return false for non-existent user', async () => {
      const result = await deleteUser(999);
      expect(result).toBe(false);
    });

    it('should not affect other users', async () => {
      const user1 = await createUser(testUserInput);
      const user2 = await createUser(adminUserInput);

      await deleteUser(user1.id);

      // Check user2 is still active
      const user2Result = await getUserById(user2.id);
      expect(user2Result).not.toBeNull();
      expect(user2Result!.is_active).toBe(true);
    });
  });
});