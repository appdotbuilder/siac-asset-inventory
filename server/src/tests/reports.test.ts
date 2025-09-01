import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { assetsTable } from '../db/schema';
import { type ReportFilter, type CreateAssetInput } from '../schema';
import { getAssetReportData } from '../handlers/reports';
import { eq } from 'drizzle-orm';

// Test asset data
const testAsset1: CreateAssetInput = {
  name: 'Monitor Dell 24"',
  description: 'High-resolution display monitor',
  category: 'monitor',
  condition: 'baik',
  owner: 'John Doe',
  photo_url: 'https://example.com/monitor.jpg',
};

const testAsset2: CreateAssetInput = {
  name: 'Office Chair',
  description: 'Ergonomic office chair',
  category: 'kursi',
  condition: 'baru',
  owner: 'Jane Smith',
  photo_url: null,
};

const testAsset3: CreateAssetInput = {
  name: 'Air Conditioner',
  description: null,
  category: 'ac',
  condition: 'sedang_diperbaiki',
  owner: 'Bob Johnson',
  photo_url: null,
};

describe('getAssetReportData', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should fetch all assets when no filters are applied', async () => {
    // Create test assets
    await db.insert(assetsTable).values([
      {
        ...testAsset1,
        qr_code: 'QR001',
      },
      {
        ...testAsset2,
        qr_code: 'QR002',
      },
      {
        ...testAsset3,
        qr_code: 'QR003',
      },
    ]).execute();

    const filter: ReportFilter = { format: 'pdf' };
    const results = await getAssetReportData(filter);

    expect(results).toHaveLength(3);
    
    // Verify asset data structure
    results.forEach(asset => {
      expect(asset.id).toBeDefined();
      expect(asset.name).toBeDefined();
      expect(asset.category).toBeDefined();
      expect(asset.condition).toBeDefined();
      expect(asset.owner).toBeDefined();
      expect(asset.qr_code).toBeDefined();
      expect(asset.created_at).toBeInstanceOf(Date);
      expect(asset.updated_at).toBeInstanceOf(Date);
      expect(typeof asset.is_archived).toBe('boolean');
    });
  });

  it('should filter assets by category', async () => {
    // Create test assets
    await db.insert(assetsTable).values([
      { ...testAsset1, qr_code: 'QR001' },
      { ...testAsset2, qr_code: 'QR002' },
      { ...testAsset3, qr_code: 'QR003' },
    ]).execute();

    const filter: ReportFilter = {
      category: 'monitor',
      format: 'pdf',
    };
    const results = await getAssetReportData(filter);

    expect(results).toHaveLength(1);
    expect(results[0].category).toBe('monitor');
    expect(results[0].name).toBe('Monitor Dell 24"');
  });

  it('should filter assets by condition', async () => {
    // Create test assets
    await db.insert(assetsTable).values([
      { ...testAsset1, qr_code: 'QR001' },
      { ...testAsset2, qr_code: 'QR002' },
      { ...testAsset3, qr_code: 'QR003' },
    ]).execute();

    const filter: ReportFilter = {
      condition: 'baru',
      format: 'pdf',
    };
    const results = await getAssetReportData(filter);

    expect(results).toHaveLength(1);
    expect(results[0].condition).toBe('baru');
    expect(results[0].name).toBe('Office Chair');
  });

  it('should filter assets by owner (case-insensitive partial match)', async () => {
    // Create test assets
    await db.insert(assetsTable).values([
      { ...testAsset1, qr_code: 'QR001' },
      { ...testAsset2, qr_code: 'QR002' },
      { ...testAsset3, qr_code: 'QR003' },
    ]).execute();

    const filter: ReportFilter = {
      owner: 'john',
      format: 'pdf',
    };
    const results = await getAssetReportData(filter);

    expect(results).toHaveLength(2); // Should match "John Doe" and "Bob Johnson"
    const ownerNames = results.map(r => r.owner);
    expect(ownerNames).toContain('John Doe');
    expect(ownerNames).toContain('Bob Johnson');
  });

  it('should filter assets by date range', async () => {
    // Create test assets with different dates
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Insert asset with specific timestamp
    await db.insert(assetsTable).values({
      ...testAsset1,
      qr_code: 'QR001',
    }).execute();

    // Wait a moment to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    await db.insert(assetsTable).values({
      ...testAsset2,
      qr_code: 'QR002',
    }).execute();

    const filter: ReportFilter = {
      start_date: yesterday,
      end_date: tomorrow,
      format: 'pdf',
    };
    const results = await getAssetReportData(filter);

    expect(results).toHaveLength(2);
    results.forEach(asset => {
      expect(asset.created_at >= yesterday).toBe(true);
      expect(asset.created_at <= tomorrow).toBe(true);
    });
  });

  it('should apply multiple filters simultaneously', async () => {
    // Create test assets
    await db.insert(assetsTable).values([
      { ...testAsset1, qr_code: 'QR001' },
      { ...testAsset2, qr_code: 'QR002' },
      { ...testAsset3, qr_code: 'QR003' },
      {
        name: 'Another Monitor',
        description: 'Second monitor',
        category: 'monitor',
        condition: 'baik',
        owner: 'Alice Brown',
        photo_url: null,
        qr_code: 'QR004',
      },
    ]).execute();

    const filter: ReportFilter = {
      category: 'monitor',
      condition: 'baik',
      owner: 'john',
      format: 'pdf',
    };
    const results = await getAssetReportData(filter);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Monitor Dell 24"');
    expect(results[0].category).toBe('monitor');
    expect(results[0].condition).toBe('baik');
    expect(results[0].owner).toBe('John Doe');
  });

  it('should return empty array when no assets match filters', async () => {
    // Create test assets
    await db.insert(assetsTable).values([
      { ...testAsset1, qr_code: 'QR001' },
      { ...testAsset2, qr_code: 'QR002' },
    ]).execute();

    const filter: ReportFilter = {
      category: 'cctv', // No assets with this category
      format: 'pdf',
    };
    const results = await getAssetReportData(filter);

    expect(results).toHaveLength(0);
  });

  it('should handle null and undefined optional fields correctly', async () => {
    // Create asset with null description and photo_url
    await db.insert(assetsTable).values({
      name: 'Test Asset',
      description: null,
      category: 'meja',
      condition: 'rusak',
      owner: 'Test Owner',
      photo_url: null,
      qr_code: 'QR001',
    }).execute();

    const filter: ReportFilter = { format: 'pdf' };
    const results = await getAssetReportData(filter);

    expect(results).toHaveLength(1);
    expect(results[0].description).toBeNull();
    expect(results[0].photo_url).toBeNull();
  });

  it('should order results by creation date', async () => {
    // Create first asset
    await db.insert(assetsTable).values({
      ...testAsset1,
      qr_code: 'QR001',
    }).execute();

    // Wait to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    // Create second asset
    await db.insert(assetsTable).values({
      ...testAsset2,
      qr_code: 'QR002',
    }).execute();

    const filter: ReportFilter = { format: 'pdf' };
    const results = await getAssetReportData(filter);

    expect(results).toHaveLength(2);
    // Should be ordered by created_at (ascending)
    expect(results[0].created_at <= results[1].created_at).toBe(true);
  });

  it('should filter by start_date only', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Create asset
    await db.insert(assetsTable).values({
      ...testAsset1,
      qr_code: 'QR001',
    }).execute();

    const filter: ReportFilter = {
      start_date: yesterday,
      format: 'pdf',
    };
    const results = await getAssetReportData(filter);

    expect(results).toHaveLength(1);
    expect(results[0].created_at >= yesterday).toBe(true);
  });

  it('should filter by end_date only', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Create asset
    await db.insert(assetsTable).values({
      ...testAsset1,
      qr_code: 'QR001',
    }).execute();

    const filter: ReportFilter = {
      end_date: tomorrow,
      format: 'pdf',
    };
    const results = await getAssetReportData(filter);

    expect(results).toHaveLength(1);
    expect(results[0].created_at <= tomorrow).toBe(true);
  });
});