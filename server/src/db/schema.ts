import { serial, text, pgTable, timestamp, integer, pgEnum, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['public', 'karyawan', 'admin']);
export const assetConditionEnum = pgEnum('asset_condition', ['baru', 'baik', 'sedang_diperbaiki', 'rusak']);
export const assetCategoryEnum = pgEnum('asset_category', ['monitor', 'cpu', 'ac', 'kursi', 'meja', 'dispenser', 'cctv', 'router', 'kabel_lan']);
export const complaintStatusEnum = pgEnum('complaint_status', ['perlu_perbaikan', 'urgent', 'sedang_diperbaiki', 'telah_diperbaiki']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  name: text('name').notNull(),
  role: userRoleEnum('role').default('karyawan').notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Assets table
export const assetsTable = pgTable('assets', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  category: assetCategoryEnum('category').notNull(),
  condition: assetConditionEnum('condition').default('baru').notNull(),
  owner: text('owner').notNull(),
  photo_url: text('photo_url'),
  qr_code: text('qr_code').notNull().unique(),
  is_archived: boolean('is_archived').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Complaints table
export const complaintsTable = pgTable('complaints', {
  id: serial('id').primaryKey(),
  asset_id: integer('asset_id').references(() => assetsTable.id).notNull(),
  sender_name: text('sender_name').notNull(),
  status: complaintStatusEnum('status').default('perlu_perbaikan').notNull(),
  description: text('description').notNull(),
  resolved_by: integer('resolved_by').references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Maintenance schedules table
export const maintenanceSchedulesTable = pgTable('maintenance_schedules', {
  id: serial('id').primaryKey(),
  asset_id: integer('asset_id').references(() => assetsTable.id).notNull(),
  scheduled_by: integer('scheduled_by').references(() => usersTable.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  scheduled_date: timestamp('scheduled_date').notNull(),
  is_completed: boolean('is_completed').default(false).notNull(),
  completed_at: timestamp('completed_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Asset history table for tracking changes
export const assetHistoryTable = pgTable('asset_history', {
  id: serial('id').primaryKey(),
  asset_id: integer('asset_id').references(() => assetsTable.id).notNull(),
  changed_by: integer('changed_by').references(() => usersTable.id),
  change_type: text('change_type').notNull(), // 'status_change', 'maintenance', 'complaint_resolved'
  old_value: text('old_value'),
  new_value: text('new_value'),
  description: text('description'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// User activity logs table
export const userActivityLogsTable = pgTable('user_activity_logs', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => usersTable.id).notNull(),
  action: text('action').notNull(),
  resource_type: text('resource_type').notNull(), // 'asset', 'complaint', 'user', etc.
  resource_id: integer('resource_id'),
  description: text('description'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  complaints: many(complaintsTable, { relationName: 'resolved_complaints' }),
  maintenanceSchedules: many(maintenanceSchedulesTable),
  assetHistory: many(assetHistoryTable),
  activityLogs: many(userActivityLogsTable),
}));

export const assetsRelations = relations(assetsTable, ({ many }) => ({
  complaints: many(complaintsTable),
  maintenanceSchedules: many(maintenanceSchedulesTable),
  history: many(assetHistoryTable),
}));

export const complaintsRelations = relations(complaintsTable, ({ one }) => ({
  asset: one(assetsTable, {
    fields: [complaintsTable.asset_id],
    references: [assetsTable.id],
  }),
  resolvedBy: one(usersTable, {
    fields: [complaintsTable.resolved_by],
    references: [usersTable.id],
    relationName: 'resolved_complaints',
  }),
}));

export const maintenanceSchedulesRelations = relations(maintenanceSchedulesTable, ({ one }) => ({
  asset: one(assetsTable, {
    fields: [maintenanceSchedulesTable.asset_id],
    references: [assetsTable.id],
  }),
  scheduledBy: one(usersTable, {
    fields: [maintenanceSchedulesTable.scheduled_by],
    references: [usersTable.id],
  }),
}));

export const assetHistoryRelations = relations(assetHistoryTable, ({ one }) => ({
  asset: one(assetsTable, {
    fields: [assetHistoryTable.asset_id],
    references: [assetsTable.id],
  }),
  changedBy: one(usersTable, {
    fields: [assetHistoryTable.changed_by],
    references: [usersTable.id],
  }),
}));

export const userActivityLogsRelations = relations(userActivityLogsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [userActivityLogsTable.user_id],
    references: [usersTable.id],
  }),
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Asset = typeof assetsTable.$inferSelect;
export type NewAsset = typeof assetsTable.$inferInsert;
export type Complaint = typeof complaintsTable.$inferSelect;
export type NewComplaint = typeof complaintsTable.$inferInsert;
export type MaintenanceSchedule = typeof maintenanceSchedulesTable.$inferSelect;
export type NewMaintenanceSchedule = typeof maintenanceSchedulesTable.$inferInsert;
export type AssetHistory = typeof assetHistoryTable.$inferSelect;
export type NewAssetHistory = typeof assetHistoryTable.$inferInsert;
export type UserActivityLog = typeof userActivityLogsTable.$inferSelect;
export type NewUserActivityLog = typeof userActivityLogsTable.$inferInsert;

// Export all tables and relations for proper query building
export const tables = {
  users: usersTable,
  assets: assetsTable,
  complaints: complaintsTable,
  maintenanceSchedules: maintenanceSchedulesTable,
  assetHistory: assetHistoryTable,
  userActivityLogs: userActivityLogsTable,
};