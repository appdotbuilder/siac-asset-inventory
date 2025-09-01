import { db } from '../db';
import { assetHistoryTable, assetsTable, usersTable } from '../db/schema';
import { type CreateAssetHistoryInput, type AssetHistory } from '../schema';
import { eq, desc } from 'drizzle-orm';

export async function createAssetHistory(input: CreateAssetHistoryInput): Promise<AssetHistory> {
  try {
    // Verify asset exists
    const assetExists = await db.select()
      .from(assetsTable)
      .where(eq(assetsTable.id, input.asset_id))
      .execute();

    if (assetExists.length === 0) {
      throw new Error(`Asset with ID ${input.asset_id} not found`);
    }

    // Verify user exists if changed_by is provided
    if (input.changed_by) {
      const userExists = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, input.changed_by))
        .execute();

      if (userExists.length === 0) {
        throw new Error(`User with ID ${input.changed_by} not found`);
      }
    }

    // Insert asset history record
    const result = await db.insert(assetHistoryTable)
      .values({
        asset_id: input.asset_id,
        changed_by: input.changed_by || null,
        change_type: input.change_type,
        old_value: input.old_value || null,
        new_value: input.new_value || null,
        description: input.description || null,
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Asset history creation failed:', error);
    throw error;
  }
}

export async function getAssetHistory(assetId: number): Promise<AssetHistory[]> {
  try {
    // Verify asset exists
    const assetExists = await db.select()
      .from(assetsTable)
      .where(eq(assetsTable.id, assetId))
      .execute();

    if (assetExists.length === 0) {
      throw new Error(`Asset with ID ${assetId} not found`);
    }

    // Get asset history ordered by creation date (newest first)
    const history = await db.select()
      .from(assetHistoryTable)
      .where(eq(assetHistoryTable.asset_id, assetId))
      .orderBy(desc(assetHistoryTable.created_at))
      .execute();

    return history;
  } catch (error) {
    console.error('Failed to fetch asset history:', error);
    throw error;
  }
}

export async function getAssetHistoryById(id: number): Promise<AssetHistory | null> {
  try {
    const result = await db.select()
      .from(assetHistoryTable)
      .where(eq(assetHistoryTable.id, id))
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Failed to fetch asset history entry:', error);
    throw error;
  }
}

export async function logStatusChange(assetId: number, oldStatus: string, newStatus: string, changedBy?: number): Promise<AssetHistory> {
  const input: CreateAssetHistoryInput = {
    asset_id: assetId,
    changed_by: changedBy || null,
    change_type: 'status_change',
    old_value: oldStatus,
    new_value: newStatus,
    description: `Status changed from ${oldStatus} to ${newStatus}`,
  };

  return createAssetHistory(input);
}

export async function logMaintenanceActivity(assetId: number, description: string, changedBy: number): Promise<AssetHistory> {
  const input: CreateAssetHistoryInput = {
    asset_id: assetId,
    changed_by: changedBy,
    change_type: 'maintenance',
    old_value: null,
    new_value: null,
    description: description,
  };

  return createAssetHistory(input);
}

export async function logComplaintResolution(assetId: number, complaintId: number, changedBy: number): Promise<AssetHistory> {
  const input: CreateAssetHistoryInput = {
    asset_id: assetId,
    changed_by: changedBy,
    change_type: 'complaint_resolved',
    old_value: null,
    new_value: complaintId.toString(),
    description: `Complaint #${complaintId} resolved`,
  };

  return createAssetHistory(input);
}