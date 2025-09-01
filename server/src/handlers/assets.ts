import { db } from '../db';
import { assetsTable, complaintsTable, maintenanceSchedulesTable, assetHistoryTable } from '../db/schema';
import { type CreateAssetInput, type UpdateAssetInput, type Asset, type AssetFilter, type Pagination } from '../schema';
import { eq, and, or, like, desc, count, SQL } from 'drizzle-orm';

export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  try {
    const result = await db.insert(assetsTable)
      .values({
        name: input.name,
        description: input.description || null,
        category: input.category,
        condition: input.condition,
        owner: input.owner,
        photo_url: input.photo_url || null,
        qr_code: `ASSET-${Date.now()}-${Math.random().toString(36).substring(7)}`, // Generate unique QR code
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Asset creation failed:', error);
    throw error;
  }
}

export async function getAssets(filter?: AssetFilter): Promise<{ assets: Asset[], pagination: Pagination }> {
  try {
    const page = filter?.page || 1;
    const limit = filter?.limit || 20;
    const offset = (page - 1) * limit;

    // Build conditions array
    const conditions: SQL<unknown>[] = [];

    // Filter by archived status (default: show only active assets)
    const isArchived = filter?.is_archived !== undefined ? filter.is_archived : false;
    conditions.push(eq(assetsTable.is_archived, isArchived));

    // Search filter (name or description)
    if (filter?.search) {
      conditions.push(
        or(
          like(assetsTable.name, `%${filter.search}%`),
          like(assetsTable.description, `%${filter.search}%`)
        )!
      );
    }

    // Category filter
    if (filter?.category) {
      conditions.push(eq(assetsTable.category, filter.category));
    }

    // Condition filter
    if (filter?.condition) {
      conditions.push(eq(assetsTable.condition, filter.condition));
    }

    // Owner filter
    if (filter?.owner) {
      conditions.push(like(assetsTable.owner, `%${filter.owner}%`));
    }

    // Build and execute main query
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
    const assets = await db.select()
      .from(assetsTable)
      .where(whereClause)
      .orderBy(desc(assetsTable.created_at))
      .limit(limit)
      .offset(offset)
      .execute();

    // Get total count for pagination
    const totalResult = await db.select({ count: count() })
      .from(assetsTable)
      .where(whereClause)
      .execute();
    const total = totalResult[0].count;

    const pagination: Pagination = {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    };

    return { assets, pagination };
  } catch (error) {
    console.error('Failed to fetch assets:', error);
    throw error;
  }
}

export async function getAssetById(id: number): Promise<Asset | null> {
  try {
    const result = await db.select()
      .from(assetsTable)
      .where(eq(assetsTable.id, id))
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Failed to fetch asset by ID:', error);
    throw error;
  }
}

export async function getAssetByQrCode(qrCode: string): Promise<Asset | null> {
  try {
    const result = await db.select()
      .from(assetsTable)
      .where(eq(assetsTable.qr_code, qrCode))
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Failed to fetch asset by QR code:', error);
    throw error;
  }
}

export async function updateAsset(input: UpdateAssetInput): Promise<Asset> {
  try {
    // First fetch the current asset to compare changes
    const currentAsset = await getAssetById(input.id);
    if (!currentAsset) {
      throw new Error(`Asset with ID ${input.id} not found`);
    }

    // Update asset
    const result = await db.update(assetsTable)
      .set({
        name: input.name,
        description: input.description,
        category: input.category,
        condition: input.condition,
        owner: input.owner,
        photo_url: input.photo_url,
        is_archived: input.is_archived,
        updated_at: new Date(),
      })
      .where(eq(assetsTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`Asset with ID ${input.id} not found`);
    }

    // Log significant changes to asset history
    const updatedAsset = result[0];
    if (input.condition && input.condition !== currentAsset.condition) {
      await db.insert(assetHistoryTable)
        .values({
          asset_id: input.id,
          change_type: 'status_change',
          old_value: currentAsset.condition,
          new_value: input.condition,
          description: `Asset condition changed from ${currentAsset.condition} to ${input.condition}`,
        })
        .execute();
    }

    return updatedAsset;
  } catch (error) {
    console.error('Asset update failed:', error);
    throw error;
  }
}

export async function deleteAsset(id: number): Promise<boolean> {
  try {
    // Verify asset exists
    const asset = await getAssetById(id);
    if (!asset) {
      throw new Error(`Asset with ID ${id} not found`);
    }

    // Soft delete by setting is_archived to true
    await db.update(assetsTable)
      .set({
        is_archived: true,
        updated_at: new Date(),
      })
      .where(eq(assetsTable.id, id))
      .execute();

    // Log the archive action
    await db.insert(assetHistoryTable)
      .values({
        asset_id: id,
        change_type: 'archived',
        description: `Asset archived (soft deleted)`,
      })
      .execute();

    return true;
  } catch (error) {
    console.error('Asset deletion failed:', error);
    throw error;
  }
}

export async function getArchivedAssets(): Promise<Asset[]> {
  try {
    const result = await db.select()
      .from(assetsTable)
      .where(eq(assetsTable.is_archived, true))
      .orderBy(desc(assetsTable.updated_at))
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to fetch archived assets:', error);
    throw error;
  }
}

export async function restoreAsset(id: number): Promise<Asset> {
  try {
    // Verify asset exists and is archived
    const asset = await getAssetById(id);
    if (!asset) {
      throw new Error(`Asset with ID ${id} not found`);
    }
    if (!asset.is_archived) {
      throw new Error(`Asset with ID ${id} is not archived`);
    }

    // Restore asset by setting is_archived to false
    const result = await db.update(assetsTable)
      .set({
        is_archived: false,
        updated_at: new Date(),
      })
      .where(eq(assetsTable.id, id))
      .returning()
      .execute();

    // Log the restore action
    await db.insert(assetHistoryTable)
      .values({
        asset_id: id,
        change_type: 'restored',
        description: `Asset restored from archive`,
      })
      .execute();

    return result[0];
  } catch (error) {
    console.error('Asset restoration failed:', error);
    throw error;
  }
}

export async function permanentDeleteAsset(id: number): Promise<boolean> {
  try {
    // Verify asset exists and is archived
    const asset = await getAssetById(id);
    if (!asset) {
      throw new Error(`Asset with ID ${id} not found`);
    }
    if (!asset.is_archived) {
      throw new Error(`Asset with ID ${id} must be archived before permanent deletion`);
    }

    // Delete related records first (foreign key constraints)
    await db.delete(complaintsTable)
      .where(eq(complaintsTable.asset_id, id))
      .execute();

    await db.delete(maintenanceSchedulesTable)
      .where(eq(maintenanceSchedulesTable.asset_id, id))
      .execute();

    await db.delete(assetHistoryTable)
      .where(eq(assetHistoryTable.asset_id, id))
      .execute();

    // Finally delete the asset
    await db.delete(assetsTable)
      .where(eq(assetsTable.id, id))
      .execute();

    return true;
  } catch (error) {
    console.error('Permanent asset deletion failed:', error);
    throw error;
  }
}