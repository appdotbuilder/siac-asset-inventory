import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { userActivityLogsTable, usersTable } from '../db/schema';
import { type CreateUserActivityLogInput } from '../schema';
import { 
  createUserActivityLog,
  getUserActivityLogs,
  getRecentActivity,
  logUserAction,
  getActivityLogsByResourceId
} from '../handlers/user_activity_logs';
import { eq } from 'drizzle-orm';

// Test user data
const testUser = {
  email: 'test@example.com',
  password: 'password123',
  name: 'Test User',
  role: 'karyawan' as const,
};

const testAdmin = {
  email: 'admin@example.com',
  password: 'password123',
  name: 'Admin User',
  role: 'admin' as const,
};

// Test input data
const testActivityInput: CreateUserActivityLogInput = {
  user_id: 1,
  action: 'create',
  resource_type: 'asset',
  resource_id: 123,
  description: 'Created new asset: Test Monitor',
};

describe('createUserActivityLog', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a user activity log', async () => {
    // Create test user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const input: CreateUserActivityLogInput = {
      ...testActivityInput,
      user_id: userId,
    };

    const result = await createUserActivityLog(input);

    // Basic field validation
    expect(result.user_id).toEqual(userId);
    expect(result.action).toEqual('create');
    expect(result.resource_type).toEqual('asset');
    expect(result.resource_id).toEqual(123);
    expect(result.description).toEqual('Created new asset: Test Monitor');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save activity log to database', async () => {
    // Create test user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const input: CreateUserActivityLogInput = {
      ...testActivityInput,
      user_id: userId,
    };

    const result = await createUserActivityLog(input);

    // Query database to verify
    const logs = await db.select()
      .from(userActivityLogsTable)
      .where(eq(userActivityLogsTable.id, result.id))
      .execute();

    expect(logs).toHaveLength(1);
    expect(logs[0].user_id).toEqual(userId);
    expect(logs[0].action).toEqual('create');
    expect(logs[0].resource_type).toEqual('asset');
    expect(logs[0].resource_id).toEqual(123);
    expect(logs[0].description).toEqual('Created new asset: Test Monitor');
    expect(logs[0].created_at).toBeInstanceOf(Date);
  });

  it('should create activity log with null optional fields', async () => {
    // Create test user first
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const input: CreateUserActivityLogInput = {
      user_id: userId,
      action: 'login',
      resource_type: 'user',
    };

    const result = await createUserActivityLog(input);

    expect(result.resource_id).toBeNull();
    expect(result.description).toBeNull();
    expect(result.action).toEqual('login');
    expect(result.resource_type).toEqual('user');
  });

  it('should throw error for non-existent user', async () => {
    const input: CreateUserActivityLogInput = {
      user_id: 999,
      action: 'create',
      resource_type: 'asset',
    };

    await expect(createUserActivityLog(input)).rejects.toThrow(/User with id 999 does not exist/i);
  });
});

describe('getUserActivityLogs', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should fetch all activity logs when no userId provided', async () => {
    // Create test users
    const user1Result = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const user2Result = await db.insert(usersTable)
      .values(testAdmin)
      .returning()
      .execute();

    const userId1 = user1Result[0].id;
    const userId2 = user2Result[0].id;

    // Create activity logs for different users
    await createUserActivityLog({
      user_id: userId1,
      action: 'create',
      resource_type: 'asset',
    });

    await createUserActivityLog({
      user_id: userId2,
      action: 'update',
      resource_type: 'complaint',
    });

    const results = await getUserActivityLogs();

    expect(results).toHaveLength(2);
    expect(results.some(log => log.user_id === userId1)).toBe(true);
    expect(results.some(log => log.user_id === userId2)).toBe(true);
  });

  it('should fetch activity logs for specific user', async () => {
    // Create test users
    const user1Result = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const user2Result = await db.insert(usersTable)
      .values(testAdmin)
      .returning()
      .execute();

    const userId1 = user1Result[0].id;
    const userId2 = user2Result[0].id;

    // Create activity logs for different users
    await createUserActivityLog({
      user_id: userId1,
      action: 'create',
      resource_type: 'asset',
    });

    await createUserActivityLog({
      user_id: userId2,
      action: 'update',
      resource_type: 'complaint',
    });

    const results = await getUserActivityLogs(userId1);

    expect(results).toHaveLength(1);
    expect(results[0].user_id).toEqual(userId1);
    expect(results[0].action).toEqual('create');
  });

  it('should return empty array for user with no logs', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const results = await getUserActivityLogs(userId);

    expect(results).toHaveLength(0);
  });

  it('should order logs by created_at descending', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Create multiple logs with slight delay
    const log1 = await createUserActivityLog({
      user_id: userId,
      action: 'create',
      resource_type: 'asset',
    });

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    const log2 = await createUserActivityLog({
      user_id: userId,
      action: 'update',
      resource_type: 'asset',
    });

    const results = await getUserActivityLogs(userId);

    expect(results).toHaveLength(2);
    expect(results[0].created_at.getTime()).toBeGreaterThanOrEqual(results[1].created_at.getTime());
  });
});

describe('getRecentActivity', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should fetch recent activity with default limit', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Create some activity logs
    await createUserActivityLog({
      user_id: userId,
      action: 'create',
      resource_type: 'asset',
    });

    await createUserActivityLog({
      user_id: userId,
      action: 'update',
      resource_type: 'asset',
    });

    const results = await getRecentActivity();

    expect(results).toHaveLength(2);
    expect(results[0].created_at.getTime()).toBeGreaterThanOrEqual(results[1].created_at.getTime());
  });

  it('should respect custom limit', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Create multiple activity logs
    for (let i = 0; i < 3; i++) {
      await createUserActivityLog({
        user_id: userId,
        action: `action_${i}`,
        resource_type: 'asset',
      });
    }

    const results = await getRecentActivity(2);

    expect(results).toHaveLength(2);
  });

  it('should return empty array when no activities exist', async () => {
    const results = await getRecentActivity();
    expect(results).toHaveLength(0);
  });
});

describe('logUserAction', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should log user action with all parameters', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const result = await logUserAction(
      userId,
      'delete',
      'asset',
      456,
      'Deleted asset: Old Monitor'
    );

    expect(result.user_id).toEqual(userId);
    expect(result.action).toEqual('delete');
    expect(result.resource_type).toEqual('asset');
    expect(result.resource_id).toEqual(456);
    expect(result.description).toEqual('Deleted asset: Old Monitor');
  });

  it('should log user action with minimal parameters', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const result = await logUserAction(userId, 'logout', 'user');

    expect(result.user_id).toEqual(userId);
    expect(result.action).toEqual('logout');
    expect(result.resource_type).toEqual('user');
    expect(result.resource_id).toBeNull();
    expect(result.description).toBeNull();
  });
});

describe('getActivityLogsByResourceId', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should fetch activity logs for specific resource', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const resourceId = 789;

    // Create logs for the specific resource
    await createUserActivityLog({
      user_id: userId,
      action: 'create',
      resource_type: 'asset',
      resource_id: resourceId,
    });

    await createUserActivityLog({
      user_id: userId,
      action: 'update',
      resource_type: 'asset',
      resource_id: resourceId,
    });

    // Create log for different resource
    await createUserActivityLog({
      user_id: userId,
      action: 'create',
      resource_type: 'asset',
      resource_id: 999,
    });

    const results = await getActivityLogsByResourceId('asset', resourceId);

    expect(results).toHaveLength(2);
    results.forEach(log => {
      expect(log.resource_type).toEqual('asset');
      expect(log.resource_id).toEqual(resourceId);
    });
  });

  it('should return empty array for resource with no logs', async () => {
    const results = await getActivityLogsByResourceId('complaint', 123);
    expect(results).toHaveLength(0);
  });

  it('should order logs by created_at descending', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const resourceId = 111;

    // Create multiple logs with delay
    const log1 = await createUserActivityLog({
      user_id: userId,
      action: 'create',
      resource_type: 'complaint',
      resource_id: resourceId,
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    const log2 = await createUserActivityLog({
      user_id: userId,
      action: 'update',
      resource_type: 'complaint',
      resource_id: resourceId,
    });

    const results = await getActivityLogsByResourceId('complaint', resourceId);

    expect(results).toHaveLength(2);
    expect(results[0].created_at.getTime()).toBeGreaterThanOrEqual(results[1].created_at.getTime());
  });

  it('should filter by both resource type and resource id', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const resourceId = 222;

    // Create logs for same resource id but different types
    await createUserActivityLog({
      user_id: userId,
      action: 'create',
      resource_type: 'asset',
      resource_id: resourceId,
    });

    await createUserActivityLog({
      user_id: userId,
      action: 'update',
      resource_type: 'complaint',
      resource_id: resourceId,
    });

    const assetResults = await getActivityLogsByResourceId('asset', resourceId);
    const complaintResults = await getActivityLogsByResourceId('complaint', resourceId);

    expect(assetResults).toHaveLength(1);
    expect(assetResults[0].resource_type).toEqual('asset');

    expect(complaintResults).toHaveLength(1);
    expect(complaintResults[0].resource_type).toEqual('complaint');
  });
});