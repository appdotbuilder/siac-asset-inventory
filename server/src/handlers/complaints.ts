import { db } from '../db';
import { complaintsTable, assetsTable, usersTable } from '../db/schema';
import { type CreateComplaintInput, type UpdateComplaintInput, type Complaint } from '../schema';
import { eq, and, or, desc, SQL } from 'drizzle-orm';

export async function createComplaint(input: CreateComplaintInput): Promise<Complaint> {
  try {
    // Verify that the asset exists and is not archived
    const asset = await db.select()
      .from(assetsTable)
      .where(and(
        eq(assetsTable.id, input.asset_id),
        eq(assetsTable.is_archived, false)
      ))
      .execute();

    if (asset.length === 0) {
      throw new Error('Asset not found or is archived');
    }

    // Create the complaint
    const result = await db.insert(complaintsTable)
      .values({
        asset_id: input.asset_id,
        sender_name: input.sender_name,
        status: input.status,
        description: input.description,
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Complaint creation failed:', error);
    throw error;
  }
}

export async function getComplaints(): Promise<Complaint[]> {
  try {
    const result = await db.select()
      .from(complaintsTable)
      .orderBy(desc(complaintsTable.created_at))
      .execute();

    return result;
  } catch (error) {
    console.error('Fetching complaints failed:', error);
    throw error;
  }
}

export async function getComplaintsByAssetId(assetId: number): Promise<Complaint[]> {
  try {
    const result = await db.select()
      .from(complaintsTable)
      .where(eq(complaintsTable.asset_id, assetId))
      .orderBy(desc(complaintsTable.created_at))
      .execute();

    return result;
  } catch (error) {
    console.error('Fetching complaints by asset ID failed:', error);
    throw error;
  }
}

export async function getComplaintById(id: number): Promise<Complaint | null> {
  try {
    const result = await db.select()
      .from(complaintsTable)
      .where(eq(complaintsTable.id, id))
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Fetching complaint by ID failed:', error);
    throw error;
  }
}

export async function updateComplaint(input: UpdateComplaintInput): Promise<Complaint> {
  try {
    // Verify that the complaint exists
    const existing = await db.select()
      .from(complaintsTable)
      .where(eq(complaintsTable.id, input.id))
      .execute();

    if (existing.length === 0) {
      throw new Error('Complaint not found');
    }

    // If resolved_by is provided, verify that the user exists
    if (input.resolved_by !== undefined) {
      const user = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, input.resolved_by))
        .execute();

      if (user.length === 0) {
        throw new Error('User not found');
      }
    }

    // Update the complaint
    const result = await db.update(complaintsTable)
      .set({
        status: input.status,
        resolved_by: input.resolved_by || null,
        updated_at: new Date(),
      })
      .where(eq(complaintsTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Complaint update failed:', error);
    throw error;
  }
}

export async function getPendingComplaints(): Promise<Complaint[]> {
  try {
    const result = await db.select()
      .from(complaintsTable)
      .where(or(
        eq(complaintsTable.status, 'perlu_perbaikan'),
        eq(complaintsTable.status, 'urgent')
      ))
      .orderBy(desc(complaintsTable.created_at))
      .execute();

    return result;
  } catch (error) {
    console.error('Fetching pending complaints failed:', error);
    throw error;
  }
}