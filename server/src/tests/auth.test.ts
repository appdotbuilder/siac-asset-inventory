import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginInput } from '../schema';
import { login, getCurrentUser } from '../handlers/auth';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'password123',
  name: 'Test User',
  role: 'karyawan' as const,
  is_active: true,
};

const adminUser = {
  email: 'admin@example.com',
  password: 'admin123',
  name: 'Admin User',
  role: 'admin' as const,
  is_active: true,
};

const inactiveUser = {
  email: 'inactive@example.com',
  password: 'password123',
  name: 'Inactive User',
  role: 'karyawan' as const,
  is_active: false,
};

describe('login', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should login with valid credentials', async () => {
    // Create test user
    const insertResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const createdUser = insertResult[0];

    const loginInput: LoginInput = {
      email: testUser.email,
      password: testUser.password,
    };

    const result = await login(loginInput);

    // Verify login response
    expect(result.id).toEqual(createdUser.id);
    expect(result.email).toEqual(testUser.email);
    expect(result.password).toEqual(''); // Password should be empty for security
    expect(result.name).toEqual(testUser.name);
    expect(result.role).toEqual(testUser.role);
    expect(result.is_active).toEqual(true);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should login admin user successfully', async () => {
    // Create admin user
    await db.insert(usersTable)
      .values(adminUser)
      .returning()
      .execute();

    const loginInput: LoginInput = {
      email: adminUser.email,
      password: adminUser.password,
    };

    const result = await login(loginInput);

    expect(result.email).toEqual(adminUser.email);
    expect(result.role).toEqual('admin');
    expect(result.password).toEqual(''); // Password should be empty
  });

  it('should reject login with invalid email', async () => {
    // Create test user
    await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const loginInput: LoginInput = {
      email: 'nonexistent@example.com',
      password: testUser.password,
    };

    await expect(login(loginInput)).rejects.toThrow(/invalid email or password/i);
  });

  it('should reject login with invalid password', async () => {
    // Create test user
    await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const loginInput: LoginInput = {
      email: testUser.email,
      password: 'wrongpassword',
    };

    await expect(login(loginInput)).rejects.toThrow(/invalid email or password/i);
  });

  it('should reject login for inactive user', async () => {
    // Create inactive user
    await db.insert(usersTable)
      .values(inactiveUser)
      .returning()
      .execute();

    const loginInput: LoginInput = {
      email: inactiveUser.email,
      password: inactiveUser.password,
    };

    await expect(login(loginInput)).rejects.toThrow(/invalid email or password/i);
  });

  it('should reject login with empty credentials', async () => {
    const loginInput: LoginInput = {
      email: '',
      password: '',
    };

    await expect(login(loginInput)).rejects.toThrow(/invalid email or password/i);
  });
});

describe('getCurrentUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get current user by ID', async () => {
    // Create test user
    const insertResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const createdUser = insertResult[0];

    const result = await getCurrentUser(createdUser.id);

    // Verify user data
    expect(result).not.toBeNull();
    expect(result!.id).toEqual(createdUser.id);
    expect(result!.email).toEqual(testUser.email);
    expect(result!.password).toEqual(''); // Password should be empty for security
    expect(result!.name).toEqual(testUser.name);
    expect(result!.role).toEqual(testUser.role);
    expect(result!.is_active).toEqual(true);
    expect(result!.created_at).toBeInstanceOf(Date);
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should get admin user by ID', async () => {
    // Create admin user
    const insertResult = await db.insert(usersTable)
      .values(adminUser)
      .returning()
      .execute();

    const createdUser = insertResult[0];

    const result = await getCurrentUser(createdUser.id);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(createdUser.id);
    expect(result!.email).toEqual(adminUser.email);
    expect(result!.role).toEqual('admin');
    expect(result!.password).toEqual('');
  });

  it('should return null for non-existent user', async () => {
    const result = await getCurrentUser(999);

    expect(result).toBeNull();
  });

  it('should return null for inactive user', async () => {
    // Create inactive user
    const insertResult = await db.insert(usersTable)
      .values(inactiveUser)
      .returning()
      .execute();

    const createdUser = insertResult[0];

    const result = await getCurrentUser(createdUser.id);

    expect(result).toBeNull();
  });

  it('should verify user exists in database after get current user', async () => {
    // Create test user
    const insertResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Get user through handler
    const result = await getCurrentUser(createdUser.id);

    // Verify user still exists in database with correct data
    const dbUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, createdUser.id))
      .execute();

    expect(dbUsers).toHaveLength(1);
    expect(dbUsers[0].email).toEqual(testUser.email);
    expect(dbUsers[0].name).toEqual(testUser.name);
    expect(dbUsers[0].is_active).toEqual(true);

    // Verify handler result matches database
    expect(result!.id).toEqual(dbUsers[0].id);
    expect(result!.email).toEqual(dbUsers[0].email);
    expect(result!.name).toEqual(dbUsers[0].name);
  });

  it('should handle multiple users correctly', async () => {
    // Create multiple users
    const insertResults = await db.insert(usersTable)
      .values([testUser, adminUser])
      .returning()
      .execute();

    const testUserId = insertResults.find(u => u.email === testUser.email)!.id;
    const adminUserId = insertResults.find(u => u.email === adminUser.email)!.id;

    // Get test user
    const testResult = await getCurrentUser(testUserId);
    expect(testResult).not.toBeNull();
    expect(testResult!.email).toEqual(testUser.email);
    expect(testResult!.role).toEqual('karyawan');

    // Get admin user
    const adminResult = await getCurrentUser(adminUserId);
    expect(adminResult).not.toBeNull();
    expect(adminResult!.email).toEqual(adminUser.email);
    expect(adminResult!.role).toEqual('admin');
  });
});