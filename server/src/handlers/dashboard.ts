import { db } from '../db';
import { assetsTable, complaintsTable, maintenanceSchedulesTable } from '../db/schema';
import { type DashboardStats } from '../schema';
import { eq, count, sql, and, gte, lte } from 'drizzle-orm';

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    // Get total assets count (non-archived)
    const totalAssetsResult = await db.select({
      count: count()
    })
    .from(assetsTable)
    .where(eq(assetsTable.is_archived, false))
    .execute();

    const totalAssets = totalAssetsResult[0]?.count || 0;

    // Get assets by condition
    const assetsByCondition = await getAssetsByCondition();

    // Get assets by category
    const assetsByCategory = await getAssetsByCategory();

    // Get pending complaints count
    const pendingComplaintsResult = await db.select({
      count: count()
    })
    .from(complaintsTable)
    .where(eq(complaintsTable.status, 'perlu_perbaikan'))
    .execute();

    const pendingComplaints = pendingComplaintsResult[0]?.count || 0;

    // Get upcoming maintenance count (next 7 days)
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const upcomingMaintenanceResult = await db.select({
      count: count()
    })
    .from(maintenanceSchedulesTable)
    .where(and(
      eq(maintenanceSchedulesTable.is_completed, false),
      gte(maintenanceSchedulesTable.scheduled_date, new Date()),
      lte(maintenanceSchedulesTable.scheduled_date, nextWeek)
    ))
    .execute();

    const upcomingMaintenance = upcomingMaintenanceResult[0]?.count || 0;

    return {
      total_assets: totalAssets,
      assets_by_condition: {
        baru: assetsByCondition['baru'] || 0,
        baik: assetsByCondition['baik'] || 0,
        sedang_diperbaiki: assetsByCondition['sedang_diperbaiki'] || 0,
        rusak: assetsByCondition['rusak'] || 0,
      },
      assets_by_category: {
        monitor: assetsByCategory['monitor'] || 0,
        cpu: assetsByCategory['cpu'] || 0,
        ac: assetsByCategory['ac'] || 0,
        kursi: assetsByCategory['kursi'] || 0,
        meja: assetsByCategory['meja'] || 0,
        dispenser: assetsByCategory['dispenser'] || 0,
        cctv: assetsByCategory['cctv'] || 0,
        router: assetsByCategory['router'] || 0,
        kabel_lan: assetsByCategory['kabel_lan'] || 0,
      },
      pending_complaints: pendingComplaints,
      upcoming_maintenance: upcomingMaintenance,
    };
  } catch (error) {
    console.error('Dashboard stats failed:', error);
    throw error;
  }
}

export async function getAssetsByCondition(): Promise<Record<string, number>> {
  try {
    const results = await db.select({
      condition: assetsTable.condition,
      count: count()
    })
    .from(assetsTable)
    .where(eq(assetsTable.is_archived, false))
    .groupBy(assetsTable.condition)
    .execute();

    const conditionCounts: Record<string, number> = {};
    
    for (const result of results) {
      conditionCounts[result.condition] = result.count;
    }

    return conditionCounts;
  } catch (error) {
    console.error('Get assets by condition failed:', error);
    throw error;
  }
}

export async function getAssetsByCategory(): Promise<Record<string, number>> {
  try {
    const results = await db.select({
      category: assetsTable.category,
      count: count()
    })
    .from(assetsTable)
    .where(eq(assetsTable.is_archived, false))
    .groupBy(assetsTable.category)
    .execute();

    const categoryCounts: Record<string, number> = {};
    
    for (const result of results) {
      categoryCounts[result.category] = result.count;
    }

    return categoryCounts;
  } catch (error) {
    console.error('Get assets by category failed:', error);
    throw error;
  }
}

export async function getComplaintStatistics(): Promise<Record<string, number>> {
  try {
    const results = await db.select({
      status: complaintsTable.status,
      count: count()
    })
    .from(complaintsTable)
    .groupBy(complaintsTable.status)
    .execute();

    const complaintStats: Record<string, number> = {};
    
    for (const result of results) {
      complaintStats[result.status] = result.count;
    }

    return complaintStats;
  } catch (error) {
    console.error('Get complaint statistics failed:', error);
    throw error;
  }
}

export async function getMaintenanceStatistics(): Promise<Record<string, number>> {
  try {
    const completedResult = await db.select({
      count: count()
    })
    .from(maintenanceSchedulesTable)
    .where(eq(maintenanceSchedulesTable.is_completed, true))
    .execute();

    const pendingResult = await db.select({
      count: count()
    })
    .from(maintenanceSchedulesTable)
    .where(eq(maintenanceSchedulesTable.is_completed, false))
    .execute();

    const overdueResult = await db.select({
      count: count()
    })
    .from(maintenanceSchedulesTable)
    .where(and(
      eq(maintenanceSchedulesTable.is_completed, false),
      lte(maintenanceSchedulesTable.scheduled_date, new Date())
    ))
    .execute();

    return {
      completed: completedResult[0]?.count || 0,
      pending: pendingResult[0]?.count || 0,
      overdue: overdueResult[0]?.count || 0,
    };
  } catch (error) {
    console.error('Get maintenance statistics failed:', error);
    throw error;
  }
}

export async function getMonthlyAssetTrends(): Promise<Record<string, number>> {
  try {
    // Get asset counts for the last 12 months
    const results = await db.select({
      month: sql<string>`TO_CHAR(${assetsTable.created_at}, 'YYYY-MM')`,
      count: count()
    })
    .from(assetsTable)
    .where(and(
      eq(assetsTable.is_archived, false),
      gte(assetsTable.created_at, sql`NOW() - INTERVAL '12 months'`)
    ))
    .groupBy(sql`TO_CHAR(${assetsTable.created_at}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${assetsTable.created_at}, 'YYYY-MM')`)
    .execute();

    const monthlyTrends: Record<string, number> = {};
    
    for (const result of results) {
      monthlyTrends[result.month] = result.count;
    }

    return monthlyTrends;
  } catch (error) {
    console.error('Get monthly asset trends failed:', error);
    throw error;
  }
}