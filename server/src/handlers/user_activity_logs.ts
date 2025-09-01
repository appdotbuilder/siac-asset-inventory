import { db } from '../db';
import { userActivityLogsTable, usersTable } from '../db/schema';
import { type CreateUserActivityLogInput, type UserActivityLog } from '../schema';
import { eq, desc, and } from 'drizzle-orm';
import { SQL } from 'drizzle-orm';

export async function createUserActivityLog(input: CreateUserActivityLogInput): Promise<UserActivityLog> {
  try {
    // Verify user exists
    const userExists = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .limit(1)
      .execute();

    if (userExists.length === 0) {
      throw new Error(`User with id ${input.user_id} does not exist`);
    }

    // Insert activity log record
    const result = await db.insert(userActivityLogsTable)
      .values({
        user_id: input.user_id,
        action: input.action,
        resource_type: input.resource_type,
        resource_id: input.resource_id || null,
        description: input.description || null,
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('User activity log creation failed:', error);
    throw error;
  }
}

export async function getUserActivityLogs(userId?: number): Promise<UserActivityLog[]> {
  try {
    if (userId !== undefined) {
      const results = await db.select()
        .from(userActivityLogsTable)
        .where(eq(userActivityLogsTable.user_id, userId))
        .orderBy(desc(userActivityLogsTable.created_at))
        .execute();
      return results;
    } else {
      const results = await db.select()
        .from(userActivityLogsTable)
        .orderBy(desc(userActivityLogsTable.created_at))
        .execute();
      return results;
    }
  } catch (error) {
    console.error('Failed to fetch user activity logs:', error);
    throw error;
  }
}

export async function getRecentActivity(limit: number = 50): Promise<UserActivityLog[]> {
  try {
    const results = await db.select()
      .from(userActivityLogsTable)
      .orderBy(desc(userActivityLogsTable.created_at))
      .limit(limit)
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch recent activity:', error);
    throw error;
  }
}

export async function logUserAction(userId: number, action: string, resourceType: string, resourceId?: number, description?: string): Promise<UserActivityLog> {
  try {
    // Create input object for createUserActivityLog
    const input: CreateUserActivityLogInput = {
      user_id: userId,
      action: action,
      resource_type: resourceType,
      resource_id: resourceId || null,
      description: description || null,
    };

    return await createUserActivityLog(input);
  } catch (error) {
    console.error('Failed to log user action:', error);
    throw error;
  }
}

export async function getActivityLogsByResourceId(resourceType: string, resourceId: number): Promise<UserActivityLog[]> {
  try {
    const conditions: SQL<unknown>[] = [
      eq(userActivityLogsTable.resource_type, resourceType),
      eq(userActivityLogsTable.resource_id, resourceId)
    ];

    const results = await db.select()
      .from(userActivityLogsTable)
      .where(and(...conditions))
      .orderBy(desc(userActivityLogsTable.created_at))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch activity logs by resource:', error);
    throw error;
  }
}