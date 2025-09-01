import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { complaintsTable, assetsTable, usersTable } from '../db/schema';
import { type CreateComplaintInput, type UpdateComplaintInput } from '../schema';
import {
  createComplaint,
  getComplaints,
  getComplaintsByAssetId,
  getComplaintById,
  updateComplaint,
  getPendingComplaints
} from '../handlers/complaints';
import { eq } from 'drizzle-orm';

// Test data
const testAsset = {
  name: 'Test Monitor',
  description: 'A monitor for testing',
  category: 'monitor' as const,
  condition: 'baik' as const,
  owner: 'Test Owner',
  qr_code: 'TEST_QR_001',
  is_archived: false,
};

const testUser = {
  email: 'test@example.com',
  password: 'password123',
  name: 'Test User',
  role: 'karyawan' as const,
  is_active: true,
};

const testComplaintInput: CreateComplaintInput = {
  asset_id: 1, // Will be set after creating asset
  sender_name: 'John Doe',
  status: 'perlu_perbaikan',
  description: 'Monitor tidak menyala dengan benar',
};

describe('complaints handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createComplaint', () => {
    it('should create a complaint successfully', async () => {
      // Create prerequisite asset
      const assetResult = await db.insert(assetsTable)
        .values(testAsset)
        .returning()
        .execute();
      
      const complaintInput = {
        ...testComplaintInput,
        asset_id: assetResult[0].id,
      };

      const result = await createComplaint(complaintInput);

      expect(result.id).toBeDefined();
      expect(result.asset_id).toEqual(assetResult[0].id);
      expect(result.sender_name).toEqual('John Doe');
      expect(result.status).toEqual('perlu_perbaikan');
      expect(result.description).toEqual('Monitor tidak menyala dengan benar');
      expect(result.resolved_by).toBeNull();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save complaint to database', async () => {
      // Create prerequisite asset
      const assetResult = await db.insert(assetsTable)
        .values(testAsset)
        .returning()
        .execute();
      
      const complaintInput = {
        ...testComplaintInput,
        asset_id: assetResult[0].id,
      };

      const result = await createComplaint(complaintInput);

      // Verify in database
      const complaints = await db.select()
        .from(complaintsTable)
        .where(eq(complaintsTable.id, result.id))
        .execute();

      expect(complaints).toHaveLength(1);
      expect(complaints[0].sender_name).toEqual('John Doe');
      expect(complaints[0].description).toEqual('Monitor tidak menyala dengan benar');
      expect(complaints[0].status).toEqual('perlu_perbaikan');
    });

    it('should throw error when asset does not exist', async () => {
      const complaintInput = {
        ...testComplaintInput,
        asset_id: 999, // Non-existent asset ID
      };

      await expect(createComplaint(complaintInput)).rejects.toThrow(/asset not found/i);
    });

    it('should throw error when asset is archived', async () => {
      // Create archived asset
      const archivedAsset = {
        ...testAsset,
        is_archived: true,
      };
      
      const assetResult = await db.insert(assetsTable)
        .values(archivedAsset)
        .returning()
        .execute();
      
      const complaintInput = {
        ...testComplaintInput,
        asset_id: assetResult[0].id,
      };

      await expect(createComplaint(complaintInput)).rejects.toThrow(/asset not found/i);
    });

    it('should create complaint with urgent status', async () => {
      // Create prerequisite asset
      const assetResult = await db.insert(assetsTable)
        .values(testAsset)
        .returning()
        .execute();
      
      const complaintInput = {
        ...testComplaintInput,
        asset_id: assetResult[0].id,
        status: 'urgent' as const,
      };

      const result = await createComplaint(complaintInput);

      expect(result.status).toEqual('urgent');
    });
  });

  describe('getComplaints', () => {
    it('should return all complaints ordered by creation date', async () => {
      // Create prerequisite asset
      const assetResult = await db.insert(assetsTable)
        .values(testAsset)
        .returning()
        .execute();

      // Create multiple complaints
      const complaint1Input = {
        ...testComplaintInput,
        asset_id: assetResult[0].id,
        sender_name: 'User One',
      };
      
      const complaint2Input = {
        ...testComplaintInput,
        asset_id: assetResult[0].id,
        sender_name: 'User Two',
        status: 'urgent' as const,
      };

      await createComplaint(complaint1Input);
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      await createComplaint(complaint2Input);

      const result = await getComplaints();

      expect(result).toHaveLength(2);
      expect(result[0].sender_name).toEqual('User Two'); // Most recent first
      expect(result[1].sender_name).toEqual('User One');
    });

    it('should return empty array when no complaints exist', async () => {
      const result = await getComplaints();
      expect(result).toHaveLength(0);
    });
  });

  describe('getComplaintsByAssetId', () => {
    it('should return complaints for specific asset', async () => {
      // Create two assets
      const asset1Result = await db.insert(assetsTable)
        .values(testAsset)
        .returning()
        .execute();
        
      const asset2 = {
        ...testAsset,
        name: 'Test CPU',
        qr_code: 'TEST_QR_002',
      };
      const asset2Result = await db.insert(assetsTable)
        .values(asset2)
        .returning()
        .execute();

      // Create complaints for both assets
      await createComplaint({
        ...testComplaintInput,
        asset_id: asset1Result[0].id,
        sender_name: 'User One',
      });
      
      await createComplaint({
        ...testComplaintInput,
        asset_id: asset2Result[0].id,
        sender_name: 'User Two',
      });

      const result = await getComplaintsByAssetId(asset1Result[0].id);

      expect(result).toHaveLength(1);
      expect(result[0].asset_id).toEqual(asset1Result[0].id);
      expect(result[0].sender_name).toEqual('User One');
    });

    it('should return empty array when no complaints exist for asset', async () => {
      const result = await getComplaintsByAssetId(999);
      expect(result).toHaveLength(0);
    });
  });

  describe('getComplaintById', () => {
    it('should return complaint by ID', async () => {
      // Create prerequisite asset
      const assetResult = await db.insert(assetsTable)
        .values(testAsset)
        .returning()
        .execute();

      const complaintInput = {
        ...testComplaintInput,
        asset_id: assetResult[0].id,
      };

      const created = await createComplaint(complaintInput);
      const result = await getComplaintById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.sender_name).toEqual('John Doe');
    });

    it('should return null when complaint does not exist', async () => {
      const result = await getComplaintById(999);
      expect(result).toBeNull();
    });
  });

  describe('updateComplaint', () => {
    it('should update complaint status successfully', async () => {
      // Create prerequisite data
      const assetResult = await db.insert(assetsTable)
        .values(testAsset)
        .returning()
        .execute();

      const userResult = await db.insert(usersTable)
        .values(testUser)
        .returning()
        .execute();

      const complaintInput = {
        ...testComplaintInput,
        asset_id: assetResult[0].id,
      };

      const created = await createComplaint(complaintInput);

      const updateInput: UpdateComplaintInput = {
        id: created.id,
        status: 'sedang_diperbaiki',
        resolved_by: userResult[0].id,
      };

      const result = await updateComplaint(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.status).toEqual('sedang_diperbaiki');
      expect(result.resolved_by).toEqual(userResult[0].id);
      expect(result.updated_at > created.updated_at).toBe(true);
    });

    it('should update complaint without resolved_by', async () => {
      // Create prerequisite asset
      const assetResult = await db.insert(assetsTable)
        .values(testAsset)
        .returning()
        .execute();

      const complaintInput = {
        ...testComplaintInput,
        asset_id: assetResult[0].id,
      };

      const created = await createComplaint(complaintInput);

      const updateInput: UpdateComplaintInput = {
        id: created.id,
        status: 'telah_diperbaiki',
      };

      const result = await updateComplaint(updateInput);

      expect(result.status).toEqual('telah_diperbaiki');
      expect(result.resolved_by).toBeNull();
    });

    it('should throw error when complaint does not exist', async () => {
      const updateInput: UpdateComplaintInput = {
        id: 999,
        status: 'sedang_diperbaiki',
      };

      await expect(updateComplaint(updateInput)).rejects.toThrow(/complaint not found/i);
    });

    it('should throw error when resolver user does not exist', async () => {
      // Create prerequisite asset
      const assetResult = await db.insert(assetsTable)
        .values(testAsset)
        .returning()
        .execute();

      const complaintInput = {
        ...testComplaintInput,
        asset_id: assetResult[0].id,
      };

      const created = await createComplaint(complaintInput);

      const updateInput: UpdateComplaintInput = {
        id: created.id,
        status: 'sedang_diperbaiki',
        resolved_by: 999, // Non-existent user
      };

      await expect(updateComplaint(updateInput)).rejects.toThrow(/user not found/i);
    });
  });

  describe('getPendingComplaints', () => {
    it('should return only pending and urgent complaints', async () => {
      // Create prerequisite asset
      const assetResult = await db.insert(assetsTable)
        .values(testAsset)
        .returning()
        .execute();

      // Create complaints with different statuses
      await createComplaint({
        ...testComplaintInput,
        asset_id: assetResult[0].id,
        sender_name: 'User One',
        status: 'perlu_perbaikan',
      });

      await createComplaint({
        ...testComplaintInput,
        asset_id: assetResult[0].id,
        sender_name: 'User Two',
        status: 'urgent',
      });

      await createComplaint({
        ...testComplaintInput,
        asset_id: assetResult[0].id,
        sender_name: 'User Three',
        status: 'sedang_diperbaiki',
      });

      await createComplaint({
        ...testComplaintInput,
        asset_id: assetResult[0].id,
        sender_name: 'User Four',
        status: 'telah_diperbaiki',
      });

      const result = await getPendingComplaints();

      expect(result).toHaveLength(2);
      expect(result.some(c => c.status === 'perlu_perbaikan')).toBe(true);
      expect(result.some(c => c.status === 'urgent')).toBe(true);
      expect(result.every(c => c.status === 'perlu_perbaikan' || c.status === 'urgent')).toBe(true);
    });

    it('should return empty array when no pending complaints exist', async () => {
      // Create prerequisite asset
      const assetResult = await db.insert(assetsTable)
        .values(testAsset)
        .returning()
        .execute();

      // Create only resolved complaints
      await createComplaint({
        ...testComplaintInput,
        asset_id: assetResult[0].id,
        status: 'telah_diperbaiki',
      });

      const result = await getPendingComplaints();
      expect(result).toHaveLength(0);
    });
  });
});