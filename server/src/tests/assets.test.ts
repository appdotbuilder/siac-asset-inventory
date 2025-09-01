import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { assetsTable, assetHistoryTable } from '../db/schema';
import { type CreateAssetInput, type UpdateAssetInput, type AssetFilter } from '../schema';
import {
  createAsset,
  getAssets,
  getAssetById,
  getAssetByQrCode,
  updateAsset,
  deleteAsset,
  getArchivedAssets,
  restoreAsset,
  permanentDeleteAsset
} from '../handlers/assets';
import { eq, count } from 'drizzle-orm';

// Test data
const testAssetInput: CreateAssetInput = {
  name: 'Test Monitor',
  description: 'Dell 24-inch monitor for testing',
  category: 'monitor',
  condition: 'baru',
  owner: 'John Doe',
  photo_url: 'https://example.com/monitor.jpg'
};

const minimalAssetInput: CreateAssetInput = {
  name: 'Minimal Asset',
  category: 'cpu',
  condition: 'baik',
  owner: 'Jane Smith'
};

describe('Asset Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createAsset', () => {
    it('should create an asset with all fields', async () => {
      const result = await createAsset(testAssetInput);

      expect(result.name).toEqual('Test Monitor');
      expect(result.description).toEqual('Dell 24-inch monitor for testing');
      expect(result.category).toEqual('monitor');
      expect(result.condition).toEqual('baru');
      expect(result.owner).toEqual('John Doe');
      expect(result.photo_url).toEqual('https://example.com/monitor.jpg');
      expect(result.qr_code).toMatch(/^ASSET-\d+-[a-z0-9]+$/);
      expect(result.is_archived).toEqual(false);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create an asset with minimal fields', async () => {
      const result = await createAsset(minimalAssetInput);

      expect(result.name).toEqual('Minimal Asset');
      expect(result.description).toBeNull();
      expect(result.category).toEqual('cpu');
      expect(result.condition).toEqual('baik');
      expect(result.owner).toEqual('Jane Smith');
      expect(result.photo_url).toBeNull();
      expect(result.qr_code).toMatch(/^ASSET-\d+-[a-z0-9]+$/);
      expect(result.is_archived).toEqual(false);
    });

    it('should save asset to database', async () => {
      const result = await createAsset(testAssetInput);

      const assets = await db.select()
        .from(assetsTable)
        .where(eq(assetsTable.id, result.id))
        .execute();

      expect(assets).toHaveLength(1);
      expect(assets[0].name).toEqual('Test Monitor');
      expect(assets[0].qr_code).toEqual(result.qr_code);
    });

    it('should generate unique QR codes', async () => {
      const asset1 = await createAsset(testAssetInput);
      const asset2 = await createAsset(minimalAssetInput);

      expect(asset1.qr_code).not.toEqual(asset2.qr_code);
    });
  });

  describe('getAssets', () => {
    it('should return empty list when no assets exist', async () => {
      const result = await getAssets();

      expect(result.assets).toHaveLength(0);
      expect(result.pagination.total).toEqual(0);
      expect(result.pagination.page).toEqual(1);
      expect(result.pagination.limit).toEqual(20);
      expect(result.pagination.total_pages).toEqual(0);
    });

    it('should return all active assets', async () => {
      await createAsset(testAssetInput);
      await createAsset(minimalAssetInput);

      const result = await getAssets();

      expect(result.assets).toHaveLength(2);
      expect(result.pagination.total).toEqual(2);
      expect(result.assets.every(asset => !asset.is_archived)).toBe(true);
    });

    it('should filter by search term', async () => {
      await createAsset(testAssetInput);
      await createAsset(minimalAssetInput);

      const filter: AssetFilter = {
        search: 'Monitor',
        page: 1,
        limit: 20
      };
      const result = await getAssets(filter);

      expect(result.assets).toHaveLength(1);
      expect(result.assets[0].name).toContain('Monitor');
    });

    it('should filter by category', async () => {
      await createAsset(testAssetInput);
      await createAsset(minimalAssetInput);

      const filter: AssetFilter = {
        category: 'cpu',
        page: 1,
        limit: 20
      };
      const result = await getAssets(filter);

      expect(result.assets).toHaveLength(1);
      expect(result.assets[0].category).toEqual('cpu');
    });

    it('should filter by condition', async () => {
      await createAsset(testAssetInput);
      await createAsset(minimalAssetInput);

      const filter: AssetFilter = {
        condition: 'baru',
        page: 1,
        limit: 20
      };
      const result = await getAssets(filter);

      expect(result.assets).toHaveLength(1);
      expect(result.assets[0].condition).toEqual('baru');
    });

    it('should filter by owner', async () => {
      await createAsset(testAssetInput);
      await createAsset(minimalAssetInput);

      const filter: AssetFilter = {
        owner: 'John',
        page: 1,
        limit: 20
      };
      const result = await getAssets(filter);

      expect(result.assets).toHaveLength(1);
      expect(result.assets[0].owner).toContain('John');
    });

    it('should handle pagination correctly', async () => {
      // Create 3 assets
      await createAsset(testAssetInput);
      await createAsset(minimalAssetInput);
      await createAsset({ ...testAssetInput, name: 'Asset 3' });

      const filter: AssetFilter = {
        page: 1,
        limit: 2
      };
      const result = await getAssets(filter);

      expect(result.assets).toHaveLength(2);
      expect(result.pagination.total).toEqual(3);
      expect(result.pagination.total_pages).toEqual(2);
    });

    it('should exclude archived assets by default', async () => {
      const asset = await createAsset(testAssetInput);
      await deleteAsset(asset.id); // Archive the asset

      const result = await getAssets();

      expect(result.assets).toHaveLength(0);
      expect(result.pagination.total).toEqual(0);
    });

    it('should include archived assets when requested', async () => {
      const asset = await createAsset(testAssetInput);
      await deleteAsset(asset.id); // Archive the asset

      const filter: AssetFilter = {
        is_archived: true,
        page: 1,
        limit: 20
      };
      const result = await getAssets(filter);

      expect(result.assets).toHaveLength(1);
      expect(result.assets[0].is_archived).toBe(true);
    });
  });

  describe('getAssetById', () => {
    it('should return asset when it exists', async () => {
      const created = await createAsset(testAssetInput);
      const result = await getAssetById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.name).toEqual('Test Monitor');
    });

    it('should return null when asset does not exist', async () => {
      const result = await getAssetById(999);
      expect(result).toBeNull();
    });
  });

  describe('getAssetByQrCode', () => {
    it('should return asset when QR code exists', async () => {
      const created = await createAsset(testAssetInput);
      const result = await getAssetByQrCode(created.qr_code);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.qr_code).toEqual(created.qr_code);
    });

    it('should return null when QR code does not exist', async () => {
      const result = await getAssetByQrCode('INVALID-QR-CODE');
      expect(result).toBeNull();
    });
  });

  describe('updateAsset', () => {
    it('should update asset fields', async () => {
      const created = await createAsset(testAssetInput);

      const updateInput: UpdateAssetInput = {
        id: created.id,
        name: 'Updated Monitor',
        condition: 'baik',
        owner: 'Updated Owner'
      };
      const result = await updateAsset(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.name).toEqual('Updated Monitor');
      expect(result.condition).toEqual('baik');
      expect(result.owner).toEqual('Updated Owner');
      expect(result.updated_at.getTime()).toBeGreaterThan(created.updated_at.getTime());
    });

    it('should create history entry when condition changes', async () => {
      const created = await createAsset(testAssetInput);

      const updateInput: UpdateAssetInput = {
        id: created.id,
        condition: 'sedang_diperbaiki'
      };
      await updateAsset(updateInput);

      const history = await db.select()
        .from(assetHistoryTable)
        .where(eq(assetHistoryTable.asset_id, created.id))
        .execute();

      expect(history).toHaveLength(1);
      expect(history[0].change_type).toEqual('status_change');
      expect(history[0].old_value).toEqual('baru');
      expect(history[0].new_value).toEqual('sedang_diperbaiki');
    });

    it('should throw error when asset does not exist', async () => {
      const updateInput: UpdateAssetInput = {
        id: 999,
        name: 'Non-existent Asset'
      };

      await expect(updateAsset(updateInput)).rejects.toThrow(/not found/i);
    });
  });

  describe('deleteAsset', () => {
    it('should soft delete asset by setting is_archived to true', async () => {
      const created = await createAsset(testAssetInput);
      const result = await deleteAsset(created.id);

      expect(result).toBe(true);

      const asset = await getAssetById(created.id);
      expect(asset!.is_archived).toBe(true);
    });

    it('should create history entry for archive action', async () => {
      const created = await createAsset(testAssetInput);
      await deleteAsset(created.id);

      const history = await db.select()
        .from(assetHistoryTable)
        .where(eq(assetHistoryTable.asset_id, created.id))
        .execute();

      expect(history).toHaveLength(1);
      expect(history[0].change_type).toEqual('archived');
    });

    it('should throw error when asset does not exist', async () => {
      await expect(deleteAsset(999)).rejects.toThrow(/not found/i);
    });
  });

  describe('getArchivedAssets', () => {
    it('should return only archived assets', async () => {
      const asset1 = await createAsset(testAssetInput);
      const asset2 = await createAsset(minimalAssetInput);
      
      await deleteAsset(asset1.id); // Archive only first asset

      const result = await getArchivedAssets();

      expect(result).toHaveLength(1);
      expect(result[0].id).toEqual(asset1.id);
      expect(result[0].is_archived).toBe(true);
    });

    it('should return empty array when no archived assets exist', async () => {
      await createAsset(testAssetInput);

      const result = await getArchivedAssets();

      expect(result).toHaveLength(0);
    });
  });

  describe('restoreAsset', () => {
    it('should restore archived asset', async () => {
      const created = await createAsset(testAssetInput);
      await deleteAsset(created.id); // Archive it first

      const result = await restoreAsset(created.id);

      expect(result.id).toEqual(created.id);
      expect(result.is_archived).toBe(false);
    });

    it('should create history entry for restore action', async () => {
      const created = await createAsset(testAssetInput);
      await deleteAsset(created.id);
      await restoreAsset(created.id);

      const history = await db.select()
        .from(assetHistoryTable)
        .where(eq(assetHistoryTable.asset_id, created.id))
        .execute();

      expect(history).toHaveLength(2); // Archive + Restore
      expect(history[1].change_type).toEqual('restored');
    });

    it('should throw error when asset does not exist', async () => {
      await expect(restoreAsset(999)).rejects.toThrow(/not found/i);
    });

    it('should throw error when asset is not archived', async () => {
      const created = await createAsset(testAssetInput);

      await expect(restoreAsset(created.id)).rejects.toThrow(/not archived/i);
    });
  });

  describe('permanentDeleteAsset', () => {
    it('should permanently delete archived asset', async () => {
      const created = await createAsset(testAssetInput);
      await deleteAsset(created.id); // Archive it first

      const result = await permanentDeleteAsset(created.id);
      expect(result).toBe(true);

      const asset = await getAssetById(created.id);
      expect(asset).toBeNull();
    });

    it('should remove asset from database completely', async () => {
      const created = await createAsset(testAssetInput);
      await deleteAsset(created.id);
      await permanentDeleteAsset(created.id);

      const countResult = await db.select({ count: count() })
        .from(assetsTable)
        .where(eq(assetsTable.id, created.id))
        .execute();

      expect(countResult[0].count).toEqual(0);
    });

    it('should throw error when asset does not exist', async () => {
      await expect(permanentDeleteAsset(999)).rejects.toThrow(/not found/i);
    });

    it('should throw error when asset is not archived', async () => {
      const created = await createAsset(testAssetInput);

      await expect(permanentDeleteAsset(created.id)).rejects.toThrow(/must be archived/i);
    });
  });
});