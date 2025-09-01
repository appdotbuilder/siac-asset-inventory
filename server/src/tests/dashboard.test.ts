import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { assetsTable, complaintsTable, maintenanceSchedulesTable, usersTable } from '../db/schema';
import { 
  getDashboardStats, 
  getAssetsByCondition, 
  getAssetsByCategory,
  getComplaintStatistics,
  getMaintenanceStatistics,
  getMonthlyAssetTrends
} from '../handlers/dashboard';

describe('Dashboard handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getDashboardStats', () => {
    it('should return empty dashboard stats when no data exists', async () => {
      const stats = await getDashboardStats();

      expect(stats.total_assets).toBe(0);
      expect(stats.pending_complaints).toBe(0);
      expect(stats.upcoming_maintenance).toBe(0);
      
      // Check all condition counts are 0
      expect(stats.assets_by_condition.baru).toBe(0);
      expect(stats.assets_by_condition.baik).toBe(0);
      expect(stats.assets_by_condition.sedang_diperbaiki).toBe(0);
      expect(stats.assets_by_condition.rusak).toBe(0);
      
      // Check all category counts are 0
      expect(stats.assets_by_category.monitor).toBe(0);
      expect(stats.assets_by_category.cpu).toBe(0);
      expect(stats.assets_by_category.ac).toBe(0);
      expect(stats.assets_by_category.kursi).toBe(0);
      expect(stats.assets_by_category.meja).toBe(0);
      expect(stats.assets_by_category.dispenser).toBe(0);
      expect(stats.assets_by_category.cctv).toBe(0);
      expect(stats.assets_by_category.router).toBe(0);
      expect(stats.assets_by_category.kabel_lan).toBe(0);
    });

    it('should return correct dashboard stats with sample data', async () => {
      // Create test user first
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
          role: 'admin'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      // Create test assets with different conditions and categories
      await db.insert(assetsTable)
        .values([
          {
            name: 'Monitor Dell',
            category: 'monitor',
            condition: 'baik',
            owner: 'IT Department',
            qr_code: 'QR001'
          },
          {
            name: 'CPU Intel',
            category: 'cpu',
            condition: 'baru',
            owner: 'IT Department',
            qr_code: 'QR002'
          },
          {
            name: 'AC Samsung',
            category: 'ac',
            condition: 'rusak',
            owner: 'Maintenance',
            qr_code: 'QR003'
          },
          {
            name: 'Archived Asset',
            category: 'monitor',
            condition: 'baik',
            owner: 'IT Department',
            qr_code: 'QR004',
            is_archived: true
          }
        ])
        .execute();

      // Get asset IDs for foreign key relations
      const assets = await db.select().from(assetsTable).execute();
      const activeAssets = assets.filter(a => !a.is_archived);

      // Create test complaints
      await db.insert(complaintsTable)
        .values([
          {
            asset_id: activeAssets[0].id,
            sender_name: 'John Doe',
            status: 'perlu_perbaikan',
            description: 'Monitor flickering'
          },
          {
            asset_id: activeAssets[1].id,
            sender_name: 'Jane Smith',
            status: 'telah_diperbaiki',
            description: 'CPU overheating'
          }
        ])
        .execute();

      // Create test maintenance schedules (upcoming within next 7 days)
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 3);

      await db.insert(maintenanceSchedulesTable)
        .values([
          {
            asset_id: activeAssets[0].id,
            scheduled_by: userId,
            title: 'Monitor cleaning',
            scheduled_date: nextWeek,
            is_completed: false
          },
          {
            asset_id: activeAssets[1].id,
            scheduled_by: userId,
            title: 'CPU maintenance',
            scheduled_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days later
            is_completed: false
          }
        ])
        .execute();

      const stats = await getDashboardStats();

      expect(stats.total_assets).toBe(3); // Only non-archived assets
      expect(stats.pending_complaints).toBe(1);
      expect(stats.upcoming_maintenance).toBe(1); // Only within next 7 days
      
      expect(stats.assets_by_condition.baru).toBe(1);
      expect(stats.assets_by_condition.baik).toBe(1);
      expect(stats.assets_by_condition.rusak).toBe(1);
      expect(stats.assets_by_condition.sedang_diperbaiki).toBe(0);
      
      expect(stats.assets_by_category.monitor).toBe(1);
      expect(stats.assets_by_category.cpu).toBe(1);
      expect(stats.assets_by_category.ac).toBe(1);
      expect(stats.assets_by_category.kursi).toBe(0);
    });
  });

  describe('getAssetsByCondition', () => {
    it('should return empty object when no assets exist', async () => {
      const result = await getAssetsByCondition();
      expect(result).toEqual({});
    });

    it('should group assets by condition correctly', async () => {
      await db.insert(assetsTable)
        .values([
          {
            name: 'Asset 1',
            category: 'monitor',
            condition: 'baik',
            owner: 'IT',
            qr_code: 'QR001'
          },
          {
            name: 'Asset 2',
            category: 'cpu',
            condition: 'baik',
            owner: 'IT',
            qr_code: 'QR002'
          },
          {
            name: 'Asset 3',
            category: 'ac',
            condition: 'rusak',
            owner: 'Maintenance',
            qr_code: 'QR003'
          }
        ])
        .execute();

      const result = await getAssetsByCondition();

      expect(result['baik']).toBe(2);
      expect(result['rusak']).toBe(1);
      expect(result['baru']).toBeUndefined();
    });

    it('should exclude archived assets from count', async () => {
      await db.insert(assetsTable)
        .values([
          {
            name: 'Active Asset',
            category: 'monitor',
            condition: 'baik',
            owner: 'IT',
            qr_code: 'QR001',
            is_archived: false
          },
          {
            name: 'Archived Asset',
            category: 'monitor',
            condition: 'baik',
            owner: 'IT',
            qr_code: 'QR002',
            is_archived: true
          }
        ])
        .execute();

      const result = await getAssetsByCondition();

      expect(result['baik']).toBe(1); // Only non-archived asset
    });
  });

  describe('getAssetsByCategory', () => {
    it('should return empty object when no assets exist', async () => {
      const result = await getAssetsByCategory();
      expect(result).toEqual({});
    });

    it('should group assets by category correctly', async () => {
      await db.insert(assetsTable)
        .values([
          {
            name: 'Monitor 1',
            category: 'monitor',
            condition: 'baik',
            owner: 'IT',
            qr_code: 'QR001'
          },
          {
            name: 'Monitor 2',
            category: 'monitor',
            condition: 'baru',
            owner: 'IT',
            qr_code: 'QR002'
          },
          {
            name: 'CPU 1',
            category: 'cpu',
            condition: 'baik',
            owner: 'IT',
            qr_code: 'QR003'
          }
        ])
        .execute();

      const result = await getAssetsByCategory();

      expect(result['monitor']).toBe(2);
      expect(result['cpu']).toBe(1);
      expect(result['ac']).toBeUndefined();
    });
  });

  describe('getComplaintStatistics', () => {
    it('should return empty object when no complaints exist', async () => {
      const result = await getComplaintStatistics();
      expect(result).toEqual({});
    });

    it('should group complaints by status correctly', async () => {
      // Create test asset first
      const assetResult = await db.insert(assetsTable)
        .values({
          name: 'Test Asset',
          category: 'monitor',
          condition: 'baik',
          owner: 'IT',
          qr_code: 'QR001'
        })
        .returning()
        .execute();

      const assetId = assetResult[0].id;

      await db.insert(complaintsTable)
        .values([
          {
            asset_id: assetId,
            sender_name: 'User 1',
            status: 'perlu_perbaikan',
            description: 'Issue 1'
          },
          {
            asset_id: assetId,
            sender_name: 'User 2',
            status: 'perlu_perbaikan',
            description: 'Issue 2'
          },
          {
            asset_id: assetId,
            sender_name: 'User 3',
            status: 'telah_diperbaiki',
            description: 'Issue 3'
          }
        ])
        .execute();

      const result = await getComplaintStatistics();

      expect(result['perlu_perbaikan']).toBe(2);
      expect(result['telah_diperbaiki']).toBe(1);
      expect(result['urgent']).toBeUndefined();
    });
  });

  describe('getMaintenanceStatistics', () => {
    it('should return zero counts when no maintenance schedules exist', async () => {
      const result = await getMaintenanceStatistics();
      
      expect(result['completed']).toBe(0);
      expect(result['pending']).toBe(0);
      expect(result['overdue']).toBe(0);
    });

    it('should categorize maintenance schedules correctly', async () => {
      // Create test user and asset
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
          role: 'admin'
        })
        .returning()
        .execute();

      const assetResult = await db.insert(assetsTable)
        .values({
          name: 'Test Asset',
          category: 'monitor',
          condition: 'baik',
          owner: 'IT',
          qr_code: 'QR001'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;
      const assetId = assetResult[0].id;

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      await db.insert(maintenanceSchedulesTable)
        .values([
          {
            asset_id: assetId,
            scheduled_by: userId,
            title: 'Completed maintenance',
            scheduled_date: yesterday,
            is_completed: true
          },
          {
            asset_id: assetId,
            scheduled_by: userId,
            title: 'Overdue maintenance',
            scheduled_date: yesterday,
            is_completed: false
          },
          {
            asset_id: assetId,
            scheduled_by: userId,
            title: 'Upcoming maintenance',
            scheduled_date: tomorrow,
            is_completed: false
          }
        ])
        .execute();

      const result = await getMaintenanceStatistics();

      expect(result['completed']).toBe(1);
      expect(result['pending']).toBe(2); // Both overdue and upcoming are pending
      expect(result['overdue']).toBe(1);
    });
  });

  describe('getMonthlyAssetTrends', () => {
    it('should return empty object when no assets exist', async () => {
      const result = await getMonthlyAssetTrends();
      expect(result).toEqual({});
    });

    it('should group assets by creation month correctly', async () => {
      const currentDate = new Date();
      const lastMonth = new Date(currentDate);
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      await db.insert(assetsTable)
        .values([
          {
            name: 'Asset 1',
            category: 'monitor',
            condition: 'baik',
            owner: 'IT',
            qr_code: 'QR001',
            created_at: currentDate
          },
          {
            name: 'Asset 2',
            category: 'cpu',
            condition: 'baik',
            owner: 'IT',
            qr_code: 'QR002',
            created_at: currentDate
          },
          {
            name: 'Asset 3',
            category: 'ac',
            condition: 'baik',
            owner: 'IT',
            qr_code: 'QR003',
            created_at: lastMonth
          }
        ])
        .execute();

      const result = await getMonthlyAssetTrends();

      const currentMonthKey = currentDate.toISOString().slice(0, 7); // YYYY-MM format
      const lastMonthKey = lastMonth.toISOString().slice(0, 7);

      expect(result[currentMonthKey]).toBe(2);
      expect(result[lastMonthKey]).toBe(1);
    });

    it('should exclude archived assets from trends', async () => {
      const currentDate = new Date();

      await db.insert(assetsTable)
        .values([
          {
            name: 'Active Asset',
            category: 'monitor',
            condition: 'baik',
            owner: 'IT',
            qr_code: 'QR001',
            created_at: currentDate,
            is_archived: false
          },
          {
            name: 'Archived Asset',
            category: 'monitor',
            condition: 'baik',
            owner: 'IT',
            qr_code: 'QR002',
            created_at: currentDate,
            is_archived: true
          }
        ])
        .execute();

      const result = await getMonthlyAssetTrends();

      const currentMonthKey = currentDate.toISOString().slice(0, 7);
      expect(result[currentMonthKey]).toBe(1); // Only non-archived asset
    });
  });
});