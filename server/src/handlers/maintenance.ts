import { db } from '../db';
import { maintenanceSchedulesTable, assetsTable, usersTable } from '../db/schema';
import { type CreateMaintenanceScheduleInput, type UpdateMaintenanceScheduleInput, type MaintenanceSchedule, type CalendarEvent } from '../schema';
import { eq, gte, lte, and, SQL } from 'drizzle-orm';

export async function createMaintenanceSchedule(input: CreateMaintenanceScheduleInput): Promise<MaintenanceSchedule> {
  try {
    // Validate that asset exists
    const asset = await db.select()
      .from(assetsTable)
      .where(eq(assetsTable.id, input.asset_id))
      .execute();
    
    if (asset.length === 0) {
      throw new Error('Asset not found');
    }

    // Validate that scheduled_by user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.scheduled_by))
      .execute();
    
    if (user.length === 0) {
      throw new Error('User not found');
    }

    // Create the maintenance schedule
    const result = await db.insert(maintenanceSchedulesTable)
      .values({
        asset_id: input.asset_id,
        scheduled_by: input.scheduled_by,
        title: input.title,
        description: input.description || null,
        scheduled_date: input.scheduled_date,
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Maintenance schedule creation failed:', error);
    throw error;
  }
}

export async function getMaintenanceSchedules(): Promise<MaintenanceSchedule[]> {
  try {
    const result = await db.select()
      .from(maintenanceSchedulesTable)
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to fetch maintenance schedules:', error);
    throw error;
  }
}

export async function getMaintenanceSchedulesByAssetId(assetId: number): Promise<MaintenanceSchedule[]> {
  try {
    const result = await db.select()
      .from(maintenanceSchedulesTable)
      .where(eq(maintenanceSchedulesTable.asset_id, assetId))
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to fetch maintenance schedules by asset ID:', error);
    throw error;
  }
}

export async function getUpcomingMaintenance(): Promise<MaintenanceSchedule[]> {
  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    const result = await db.select()
      .from(maintenanceSchedulesTable)
      .where(
        and(
          gte(maintenanceSchedulesTable.scheduled_date, now),
          lte(maintenanceSchedulesTable.scheduled_date, thirtyDaysFromNow),
          eq(maintenanceSchedulesTable.is_completed, false)
        )
      )
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to fetch upcoming maintenance:', error);
    throw error;
  }
}

export async function updateMaintenanceSchedule(input: UpdateMaintenanceScheduleInput): Promise<MaintenanceSchedule> {
  try {
    // Build update object dynamically
    const updateData: any = {};
    
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.scheduled_date !== undefined) updateData.scheduled_date = input.scheduled_date;
    if (input.is_completed !== undefined) {
      updateData.is_completed = input.is_completed;
      // Set completed_at when marking as completed
      if (input.is_completed && !input.completed_at) {
        updateData.completed_at = new Date();
      }
    }
    if (input.completed_at !== undefined) updateData.completed_at = input.completed_at;

    // Always update the updated_at timestamp
    updateData.updated_at = new Date();

    const result = await db.update(maintenanceSchedulesTable)
      .set(updateData)
      .where(eq(maintenanceSchedulesTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Maintenance schedule not found');
    }

    return result[0];
  } catch (error) {
    console.error('Failed to update maintenance schedule:', error);
    throw error;
  }
}

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  try {
    const result = await db.select({
      id: maintenanceSchedulesTable.id,
      title: maintenanceSchedulesTable.title,
      description: maintenanceSchedulesTable.description,
      date: maintenanceSchedulesTable.scheduled_date,
      asset_name: assetsTable.name,
    })
      .from(maintenanceSchedulesTable)
      .innerJoin(assetsTable, eq(maintenanceSchedulesTable.asset_id, assetsTable.id))
      .where(eq(maintenanceSchedulesTable.is_completed, false))
      .execute();

    return result.map(item => ({
      id: item.id,
      title: item.title,
      description: item.description,
      date: item.date,
      type: 'maintenance' as const,
      asset_name: item.asset_name,
    }));
  } catch (error) {
    console.error('Failed to fetch calendar events:', error);
    throw error;
  }
}

export async function markMaintenanceCompleted(id: number): Promise<MaintenanceSchedule> {
  try {
    const now = new Date();
    
    const result = await db.update(maintenanceSchedulesTable)
      .set({
        is_completed: true,
        completed_at: now,
        updated_at: now,
      })
      .where(eq(maintenanceSchedulesTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Maintenance schedule not found');
    }

    return result[0];
  } catch (error) {
    console.error('Failed to mark maintenance as completed:', error);
    throw error;
  }
}