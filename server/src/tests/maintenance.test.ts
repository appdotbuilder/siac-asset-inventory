import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { maintenanceSchedulesTable, assetsTable, usersTable } from '../db/schema';
import { type CreateMaintenanceScheduleInput, type UpdateMaintenanceScheduleInput } from '../schema';
import { 
  createMaintenanceSchedule,
  getMaintenanceSchedules,
  getMaintenanceSchedulesByAssetId,
  getUpcomingMaintenance,
  updateMaintenanceSchedule,
  getCalendarEvents,
  markMaintenanceCompleted
} from '../handlers/maintenance';
import { eq } from 'drizzle-orm';

// Test data setup
let testUser: any;
let testAsset: any;

const setupTestData = async () => {
  // Create a test user
  const userResult = await db.insert(usersTable)
    .values({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      role: 'admin',
      is_active: true,
    })
    .returning()
    .execute();
  testUser = userResult[0];

  // Create a test asset
  const assetResult = await db.insert(assetsTable)
    .values({
      name: 'Test Monitor',
      description: 'A test monitor for testing',
      category: 'monitor',
      condition: 'baik',
      owner: 'IT Department',
      qr_code: 'TEST_QR_001',
    })
    .returning()
    .execute();
  testAsset = assetResult[0];
};

const testMaintenanceInput: CreateMaintenanceScheduleInput = {
  asset_id: 0, // Will be set in beforeEach
  scheduled_by: 0, // Will be set in beforeEach
  title: 'Monthly Monitor Maintenance',
  description: 'Regular cleaning and inspection',
  scheduled_date: new Date('2024-02-15T10:00:00Z'),
};

describe('maintenance handlers', () => {
  beforeEach(async () => {
    await createDB();
    await setupTestData();
    testMaintenanceInput.asset_id = testAsset.id;
    testMaintenanceInput.scheduled_by = testUser.id;
  });

  afterEach(resetDB);

  describe('createMaintenanceSchedule', () => {
    it('should create a maintenance schedule', async () => {
      const result = await createMaintenanceSchedule(testMaintenanceInput);

      expect(result.id).toBeDefined();
      expect(result.asset_id).toEqual(testAsset.id);
      expect(result.scheduled_by).toEqual(testUser.id);
      expect(result.title).toEqual('Monthly Monitor Maintenance');
      expect(result.description).toEqual('Regular cleaning and inspection');
      expect(result.scheduled_date).toEqual(new Date('2024-02-15T10:00:00Z'));
      expect(result.is_completed).toBe(false);
      expect(result.completed_at).toBeNull();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save maintenance schedule to database', async () => {
      const result = await createMaintenanceSchedule(testMaintenanceInput);

      const schedules = await db.select()
        .from(maintenanceSchedulesTable)
        .where(eq(maintenanceSchedulesTable.id, result.id))
        .execute();

      expect(schedules).toHaveLength(1);
      expect(schedules[0].title).toEqual('Monthly Monitor Maintenance');
      expect(schedules[0].asset_id).toEqual(testAsset.id);
      expect(schedules[0].scheduled_by).toEqual(testUser.id);
      expect(schedules[0].is_completed).toBe(false);
    });

    it('should handle maintenance schedule without description', async () => {
      const inputWithoutDescription = {
        ...testMaintenanceInput,
        description: undefined,
      };

      const result = await createMaintenanceSchedule(inputWithoutDescription);

      expect(result.description).toBeNull();
    });

    it('should throw error when asset does not exist', async () => {
      const invalidInput = {
        ...testMaintenanceInput,
        asset_id: 999999,
      };

      await expect(createMaintenanceSchedule(invalidInput)).rejects.toThrow(/asset not found/i);
    });

    it('should throw error when user does not exist', async () => {
      const invalidInput = {
        ...testMaintenanceInput,
        scheduled_by: 999999,
      };

      await expect(createMaintenanceSchedule(invalidInput)).rejects.toThrow(/user not found/i);
    });
  });

  describe('getMaintenanceSchedules', () => {
    it('should return empty array when no schedules exist', async () => {
      const result = await getMaintenanceSchedules();
      expect(result).toEqual([]);
    });

    it('should return all maintenance schedules', async () => {
      await createMaintenanceSchedule(testMaintenanceInput);
      await createMaintenanceSchedule({
        ...testMaintenanceInput,
        title: 'Weekly Check',
        scheduled_date: new Date('2024-02-22T14:00:00Z'),
      });

      const result = await getMaintenanceSchedules();

      expect(result).toHaveLength(2);
      expect(result[0].title).toEqual('Monthly Monitor Maintenance');
      expect(result[1].title).toEqual('Weekly Check');
    });
  });

  describe('getMaintenanceSchedulesByAssetId', () => {
    it('should return empty array when asset has no schedules', async () => {
      const result = await getMaintenanceSchedulesByAssetId(testAsset.id);
      expect(result).toEqual([]);
    });

    it('should return schedules for specific asset', async () => {
      // Create another asset
      const anotherAsset = await db.insert(assetsTable)
        .values({
          name: 'Another Monitor',
          category: 'monitor',
          condition: 'baik',
          owner: 'HR Department',
          qr_code: 'TEST_QR_002',
        })
        .returning()
        .execute();

      // Create schedules for both assets
      await createMaintenanceSchedule(testMaintenanceInput);
      await createMaintenanceSchedule({
        ...testMaintenanceInput,
        asset_id: anotherAsset[0].id,
        title: 'Another Asset Maintenance',
      });

      const result = await getMaintenanceSchedulesByAssetId(testAsset.id);

      expect(result).toHaveLength(1);
      expect(result[0].asset_id).toEqual(testAsset.id);
      expect(result[0].title).toEqual('Monthly Monitor Maintenance');
    });
  });

  describe('getUpcomingMaintenance', () => {
    it('should return empty array when no upcoming maintenance exists', async () => {
      const result = await getUpcomingMaintenance();
      expect(result).toEqual([]);
    });

    it('should return upcoming maintenance schedules within 30 days', async () => {
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(now.getDate() + 15); // 15 days from now

      await createMaintenanceSchedule({
        ...testMaintenanceInput,
        scheduled_date: futureDate,
        title: 'Upcoming Maintenance',
      });

      const result = await getUpcomingMaintenance();

      expect(result).toHaveLength(1);
      expect(result[0].title).toEqual('Upcoming Maintenance');
      expect(result[0].is_completed).toBe(false);
    });

    it('should not return past maintenance or completed maintenance', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10); // 10 days ago

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 15); // 15 days from now

      // Create past maintenance
      await createMaintenanceSchedule({
        ...testMaintenanceInput,
        scheduled_date: pastDate,
        title: 'Past Maintenance',
      });

      // Create upcoming maintenance
      const upcomingSchedule = await createMaintenanceSchedule({
        ...testMaintenanceInput,
        scheduled_date: futureDate,
        title: 'Upcoming Maintenance',
      });

      // Mark upcoming maintenance as completed
      await markMaintenanceCompleted(upcomingSchedule.id);

      const result = await getUpcomingMaintenance();

      expect(result).toHaveLength(0);
    });
  });

  describe('updateMaintenanceSchedule', () => {
    let createdSchedule: any;

    beforeEach(async () => {
      createdSchedule = await createMaintenanceSchedule(testMaintenanceInput);
    });

    it('should update maintenance schedule title', async () => {
      const updateInput: UpdateMaintenanceScheduleInput = {
        id: createdSchedule.id,
        title: 'Updated Maintenance Title',
      };

      const result = await updateMaintenanceSchedule(updateInput);

      expect(result.title).toEqual('Updated Maintenance Title');
      expect(result.description).toEqual('Regular cleaning and inspection');
    });

    it('should update maintenance schedule completion status', async () => {
      const updateInput: UpdateMaintenanceScheduleInput = {
        id: createdSchedule.id,
        is_completed: true,
      };

      const result = await updateMaintenanceSchedule(updateInput);

      expect(result.is_completed).toBe(true);
      expect(result.completed_at).toBeInstanceOf(Date);
    });

    it('should update scheduled date', async () => {
      const newDate = new Date('2024-03-01T10:00:00Z');
      const updateInput: UpdateMaintenanceScheduleInput = {
        id: createdSchedule.id,
        scheduled_date: newDate,
      };

      const result = await updateMaintenanceSchedule(updateInput);

      expect(result.scheduled_date).toEqual(newDate);
    });

    it('should throw error when maintenance schedule does not exist', async () => {
      const updateInput: UpdateMaintenanceScheduleInput = {
        id: 999999,
        title: 'Updated Title',
      };

      await expect(updateMaintenanceSchedule(updateInput)).rejects.toThrow(/maintenance schedule not found/i);
    });
  });

  describe('getCalendarEvents', () => {
    it('should return empty array when no maintenance schedules exist', async () => {
      const result = await getCalendarEvents();
      expect(result).toEqual([]);
    });

    it('should return calendar events for incomplete maintenance schedules', async () => {
      await createMaintenanceSchedule(testMaintenanceInput);

      const result = await getCalendarEvents();

      expect(result).toHaveLength(1);
      expect(result[0].title).toEqual('Monthly Monitor Maintenance');
      expect(result[0].type).toEqual('maintenance');
      expect(result[0].asset_name).toEqual('Test Monitor');
      expect(result[0].date).toEqual(new Date('2024-02-15T10:00:00Z'));
      expect(result[0].description).toEqual('Regular cleaning and inspection');
    });

    it('should not return completed maintenance schedules', async () => {
      const schedule = await createMaintenanceSchedule(testMaintenanceInput);
      await markMaintenanceCompleted(schedule.id);

      const result = await getCalendarEvents();

      expect(result).toHaveLength(0);
    });
  });

  describe('markMaintenanceCompleted', () => {
    let createdSchedule: any;

    beforeEach(async () => {
      createdSchedule = await createMaintenanceSchedule(testMaintenanceInput);
    });

    it('should mark maintenance schedule as completed', async () => {
      const result = await markMaintenanceCompleted(createdSchedule.id);

      expect(result.is_completed).toBe(true);
      expect(result.completed_at).toBeInstanceOf(Date);
    });

    it('should save completion status to database', async () => {
      await markMaintenanceCompleted(createdSchedule.id);

      const schedules = await db.select()
        .from(maintenanceSchedulesTable)
        .where(eq(maintenanceSchedulesTable.id, createdSchedule.id))
        .execute();

      expect(schedules[0].is_completed).toBe(true);
      expect(schedules[0].completed_at).toBeInstanceOf(Date);
    });

    it('should throw error when maintenance schedule does not exist', async () => {
      await expect(markMaintenanceCompleted(999999)).rejects.toThrow(/maintenance schedule not found/i);
    });
  });
});