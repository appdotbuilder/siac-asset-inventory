import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, assetsTable, assetHistoryTable } from '../db/schema';
import { type CreateAssetHistoryInput } from '../schema';
import { 
  createAssetHistory, 
  getAssetHistory, 
  getAssetHistoryById,
  logStatusChange,
  logMaintenanceActivity,
  logComplaintResolution
} from '../handlers/asset_history';
import { eq } from 'drizzle-orm';

describe('Asset History Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: number;
  let testAssetId: number;

  beforeEach(async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        role: 'karyawan'
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;

    // Create test asset
    const assetResult = await db.insert(assetsTable)
      .values({
        name: 'Test Monitor',
        description: 'Test monitor for history tracking',
        category: 'monitor',
        condition: 'baru',
        owner: 'IT Department',
        qr_code: 'QR001'
      })
      .returning()
      .execute();
    testAssetId = assetResult[0].id;
  });

  describe('createAssetHistory', () => {
    const testInput: CreateAssetHistoryInput = {
      asset_id: 0, // Will be set in test
      changed_by: 0, // Will be set in test
      change_type: 'status_change',
      old_value: 'baru',
      new_value: 'baik',
      description: 'Manual status update'
    };

    it('should create asset history with all fields', async () => {
      const input = {
        ...testInput,
        asset_id: testAssetId,
        changed_by: testUserId
      };

      const result = await createAssetHistory(input);

      expect(result.id).toBeDefined();
      expect(result.asset_id).toBe(testAssetId);
      expect(result.changed_by).toBe(testUserId);
      expect(result.change_type).toBe('status_change');
      expect(result.old_value).toBe('baru');
      expect(result.new_value).toBe('baik');
      expect(result.description).toBe('Manual status update');
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create asset history without changed_by', async () => {
      const input: CreateAssetHistoryInput = {
        asset_id: testAssetId,
        change_type: 'system_update',
        old_value: null,
        new_value: 'archived',
        description: 'Automated archive process'
      };

      const result = await createAssetHistory(input);

      expect(result.id).toBeDefined();
      expect(result.asset_id).toBe(testAssetId);
      expect(result.changed_by).toBeNull();
      expect(result.change_type).toBe('system_update');
      expect(result.old_value).toBeNull();
      expect(result.new_value).toBe('archived');
      expect(result.description).toBe('Automated archive process');
    });

    it('should save history to database', async () => {
      const input = {
        ...testInput,
        asset_id: testAssetId,
        changed_by: testUserId
      };

      const result = await createAssetHistory(input);

      const historyEntries = await db.select()
        .from(assetHistoryTable)
        .where(eq(assetHistoryTable.id, result.id))
        .execute();

      expect(historyEntries).toHaveLength(1);
      expect(historyEntries[0].asset_id).toBe(testAssetId);
      expect(historyEntries[0].changed_by).toBe(testUserId);
      expect(historyEntries[0].change_type).toBe('status_change');
    });

    it('should throw error for non-existent asset', async () => {
      const input = {
        ...testInput,
        asset_id: 99999,
        changed_by: testUserId
      };

      await expect(createAssetHistory(input)).rejects.toThrow(/Asset with ID 99999 not found/i);
    });

    it('should throw error for non-existent user', async () => {
      const input = {
        ...testInput,
        asset_id: testAssetId,
        changed_by: 99999
      };

      await expect(createAssetHistory(input)).rejects.toThrow(/User with ID 99999 not found/i);
    });
  });

  describe('getAssetHistory', () => {
    beforeEach(async () => {
      // Create multiple history entries
      await db.insert(assetHistoryTable)
        .values([
          {
            asset_id: testAssetId,
            changed_by: testUserId,
            change_type: 'status_change',
            old_value: 'baru',
            new_value: 'baik',
            description: 'First change'
          },
          {
            asset_id: testAssetId,
            changed_by: testUserId,
            change_type: 'maintenance',
            old_value: null,
            new_value: null,
            description: 'Routine maintenance'
          },
          {
            asset_id: testAssetId,
            changed_by: null,
            change_type: 'system_update',
            old_value: 'baik',
            new_value: 'sedang_diperbaiki',
            description: 'System-initiated status change'
          }
        ])
        .execute();
    });

    it('should return asset history ordered by newest first', async () => {
      const history = await getAssetHistory(testAssetId);

      expect(history).toHaveLength(3);
      
      // Verify chronological order (newest first)
      for (let i = 1; i < history.length; i++) {
        expect(history[i-1].created_at >= history[i].created_at).toBe(true);
      }

      // Verify all expected change types are present
      const changeTypes = history.map(h => h.change_type);
      expect(changeTypes).toContain('status_change');
      expect(changeTypes).toContain('maintenance');
      expect(changeTypes).toContain('system_update');
    });

    it('should return empty array for asset with no history', async () => {
      // Create another asset
      const anotherAsset = await db.insert(assetsTable)
        .values({
          name: 'Clean Asset',
          category: 'cpu',
          condition: 'baru',
          owner: 'Test Owner',
          qr_code: 'QR002'
        })
        .returning()
        .execute();

      const history = await getAssetHistory(anotherAsset[0].id);

      expect(history).toHaveLength(0);
    });

    it('should throw error for non-existent asset', async () => {
      await expect(getAssetHistory(99999)).rejects.toThrow(/Asset with ID 99999 not found/i);
    });

    it('should return all fields correctly', async () => {
      const history = await getAssetHistory(testAssetId);

      expect(history.length).toBeGreaterThan(0);
      const entry = history[0];
      expect(entry.id).toBeDefined();
      expect(entry.asset_id).toBe(testAssetId);
      expect(entry.change_type).toBeDefined();
      expect(entry.created_at).toBeInstanceOf(Date);
    });
  });

  describe('getAssetHistoryById', () => {
    let historyId: number;

    beforeEach(async () => {
      const result = await db.insert(assetHistoryTable)
        .values({
          asset_id: testAssetId,
          changed_by: testUserId,
          change_type: 'maintenance',
          description: 'Test maintenance entry'
        })
        .returning()
        .execute();
      historyId = result[0].id;
    });

    it('should return history entry by id', async () => {
      const entry = await getAssetHistoryById(historyId);

      expect(entry).not.toBeNull();
      expect(entry!.id).toBe(historyId);
      expect(entry!.asset_id).toBe(testAssetId);
      expect(entry!.changed_by).toBe(testUserId);
      expect(entry!.change_type).toBe('maintenance');
      expect(entry!.description).toBe('Test maintenance entry');
    });

    it('should return null for non-existent id', async () => {
      const entry = await getAssetHistoryById(99999);

      expect(entry).toBeNull();
    });
  });

  describe('logStatusChange', () => {
    it('should create status change history entry', async () => {
      const result = await logStatusChange(testAssetId, 'baru', 'baik', testUserId);

      expect(result.asset_id).toBe(testAssetId);
      expect(result.changed_by).toBe(testUserId);
      expect(result.change_type).toBe('status_change');
      expect(result.old_value).toBe('baru');
      expect(result.new_value).toBe('baik');
      expect(result.description).toBe('Status changed from baru to baik');
    });

    it('should create status change without changed_by', async () => {
      const result = await logStatusChange(testAssetId, 'baik', 'rusak');

      expect(result.asset_id).toBe(testAssetId);
      expect(result.changed_by).toBeNull();
      expect(result.change_type).toBe('status_change');
      expect(result.old_value).toBe('baik');
      expect(result.new_value).toBe('rusak');
      expect(result.description).toBe('Status changed from baik to rusak');
    });

    it('should save to database correctly', async () => {
      const result = await logStatusChange(testAssetId, 'baru', 'sedang_diperbaiki', testUserId);

      const saved = await db.select()
        .from(assetHistoryTable)
        .where(eq(assetHistoryTable.id, result.id))
        .execute();

      expect(saved).toHaveLength(1);
      expect(saved[0].change_type).toBe('status_change');
      expect(saved[0].old_value).toBe('baru');
      expect(saved[0].new_value).toBe('sedang_diperbaiki');
    });
  });

  describe('logMaintenanceActivity', () => {
    it('should create maintenance history entry', async () => {
      const description = 'Replaced faulty capacitors and cleaned dust';
      const result = await logMaintenanceActivity(testAssetId, description, testUserId);

      expect(result.asset_id).toBe(testAssetId);
      expect(result.changed_by).toBe(testUserId);
      expect(result.change_type).toBe('maintenance');
      expect(result.old_value).toBeNull();
      expect(result.new_value).toBeNull();
      expect(result.description).toBe(description);
    });

    it('should save to database correctly', async () => {
      const description = 'Software update and driver installation';
      const result = await logMaintenanceActivity(testAssetId, description, testUserId);

      const saved = await db.select()
        .from(assetHistoryTable)
        .where(eq(assetHistoryTable.id, result.id))
        .execute();

      expect(saved).toHaveLength(1);
      expect(saved[0].change_type).toBe('maintenance');
      expect(saved[0].description).toBe(description);
      expect(saved[0].changed_by).toBe(testUserId);
    });
  });

  describe('logComplaintResolution', () => {
    it('should create complaint resolution history entry', async () => {
      const complaintId = 123;
      const result = await logComplaintResolution(testAssetId, complaintId, testUserId);

      expect(result.asset_id).toBe(testAssetId);
      expect(result.changed_by).toBe(testUserId);
      expect(result.change_type).toBe('complaint_resolved');
      expect(result.old_value).toBeNull();
      expect(result.new_value).toBe('123');
      expect(result.description).toBe('Complaint #123 resolved');
    });

    it('should save to database correctly', async () => {
      const complaintId = 456;
      const result = await logComplaintResolution(testAssetId, complaintId, testUserId);

      const saved = await db.select()
        .from(assetHistoryTable)
        .where(eq(assetHistoryTable.id, result.id))
        .execute();

      expect(saved).toHaveLength(1);
      expect(saved[0].change_type).toBe('complaint_resolved');
      expect(saved[0].new_value).toBe('456');
      expect(saved[0].description).toBe('Complaint #456 resolved');
      expect(saved[0].changed_by).toBe(testUserId);
    });
  });
});