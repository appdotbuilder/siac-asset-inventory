import { z } from 'zod';

// Enums
export const userRoleSchema = z.enum(['public', 'karyawan', 'admin']);
export const assetConditionSchema = z.enum(['baru', 'baik', 'sedang_diperbaiki', 'rusak']);
export const assetCategorySchema = z.enum(['monitor', 'cpu', 'ac', 'kursi', 'meja', 'dispenser', 'cctv', 'router', 'kabel_lan']);
export const complaintStatusSchema = z.enum(['perlu_perbaikan', 'urgent', 'sedang_diperbaiki', 'telah_diperbaiki']);

// User schemas
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  password: z.string(),
  name: z.string(),
  role: userRoleSchema,
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type User = z.infer<typeof userSchema>;

export const createUserInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: userRoleSchema.default('karyawan'),
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  id: z.number(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  name: z.string().min(1).optional(),
  role: userRoleSchema.optional(),
  is_active: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

// Asset schemas
export const assetSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  category: assetCategorySchema,
  condition: assetConditionSchema,
  owner: z.string(),
  photo_url: z.string().nullable(),
  qr_code: z.string(),
  is_archived: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Asset = z.infer<typeof assetSchema>;

export const createAssetInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  category: assetCategorySchema,
  condition: assetConditionSchema.default('baru'),
  owner: z.string().min(1),
  photo_url: z.string().nullable().optional(),
});

export type CreateAssetInput = z.infer<typeof createAssetInputSchema>;

export const updateAssetInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category: assetCategorySchema.optional(),
  condition: assetConditionSchema.optional(),
  owner: z.string().min(1).optional(),
  photo_url: z.string().nullable().optional(),
  is_archived: z.boolean().optional(),
});

export type UpdateAssetInput = z.infer<typeof updateAssetInputSchema>;

export const assetFilterSchema = z.object({
  search: z.string().optional(),
  category: assetCategorySchema.optional(),
  condition: assetConditionSchema.optional(),
  owner: z.string().optional(),
  is_archived: z.boolean().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

export type AssetFilter = z.infer<typeof assetFilterSchema>;

// Complaint schemas
export const complaintSchema = z.object({
  id: z.number(),
  asset_id: z.number(),
  sender_name: z.string(),
  status: complaintStatusSchema,
  description: z.string(),
  resolved_by: z.number().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Complaint = z.infer<typeof complaintSchema>;

export const createComplaintInputSchema = z.object({
  asset_id: z.number(),
  sender_name: z.string().min(1),
  status: complaintStatusSchema.default('perlu_perbaikan'),
  description: z.string().min(1),
});

export type CreateComplaintInput = z.infer<typeof createComplaintInputSchema>;

export const updateComplaintInputSchema = z.object({
  id: z.number(),
  status: complaintStatusSchema,
  resolved_by: z.number().optional(),
});

export type UpdateComplaintInput = z.infer<typeof updateComplaintInputSchema>;

// Maintenance schedule schemas
export const maintenanceScheduleSchema = z.object({
  id: z.number(),
  asset_id: z.number(),
  scheduled_by: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  scheduled_date: z.coerce.date(),
  is_completed: z.boolean(),
  completed_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type MaintenanceSchedule = z.infer<typeof maintenanceScheduleSchema>;

export const createMaintenanceScheduleInputSchema = z.object({
  asset_id: z.number(),
  scheduled_by: z.number(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  scheduled_date: z.coerce.date(),
});

export type CreateMaintenanceScheduleInput = z.infer<typeof createMaintenanceScheduleInputSchema>;

export const updateMaintenanceScheduleInputSchema = z.object({
  id: z.number(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  scheduled_date: z.coerce.date().optional(),
  is_completed: z.boolean().optional(),
  completed_at: z.coerce.date().nullable().optional(),
});

export type UpdateMaintenanceScheduleInput = z.infer<typeof updateMaintenanceScheduleInputSchema>;

// Asset history schemas
export const assetHistorySchema = z.object({
  id: z.number(),
  asset_id: z.number(),
  changed_by: z.number().nullable(),
  change_type: z.string(),
  old_value: z.string().nullable(),
  new_value: z.string().nullable(),
  description: z.string().nullable(),
  created_at: z.coerce.date(),
});

export type AssetHistory = z.infer<typeof assetHistorySchema>;

export const createAssetHistoryInputSchema = z.object({
  asset_id: z.number(),
  changed_by: z.number().nullable().optional(),
  change_type: z.string().min(1),
  old_value: z.string().nullable().optional(),
  new_value: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export type CreateAssetHistoryInput = z.infer<typeof createAssetHistoryInputSchema>;

// User activity log schemas
export const userActivityLogSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.number().nullable(),
  description: z.string().nullable(),
  created_at: z.coerce.date(),
});

export type UserActivityLog = z.infer<typeof userActivityLogSchema>;

export const createUserActivityLogInputSchema = z.object({
  user_id: z.number(),
  action: z.string().min(1),
  resource_type: z.string().min(1),
  resource_id: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
});

export type CreateUserActivityLogInput = z.infer<typeof createUserActivityLogInputSchema>;

// Report schemas
export const reportFilterSchema = z.object({
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
  category: assetCategorySchema.optional(),
  condition: assetConditionSchema.optional(),
  owner: z.string().optional(),
  format: z.enum(['pdf', 'xlsx']).default('pdf'),
});

export type ReportFilter = z.infer<typeof reportFilterSchema>;

// AI Gemini suggestion schemas
export const aiSuggestionInputSchema = z.object({
  asset_id: z.number(),
});

export type AiSuggestionInput = z.infer<typeof aiSuggestionInputSchema>;

export const aiSuggestionSchema = z.object({
  feasibility: z.string(),
  maintenance_prediction: z.string(),
  replacement_recommendation: z.string(),
});

export type AiSuggestion = z.infer<typeof aiSuggestionSchema>;

// Dashboard schemas
export const dashboardStatsSchema = z.object({
  total_assets: z.number(),
  assets_by_condition: z.record(assetConditionSchema, z.number()),
  assets_by_category: z.record(assetCategorySchema, z.number()),
  pending_complaints: z.number(),
  upcoming_maintenance: z.number(),
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

// Calendar event schemas
export const calendarEventSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  date: z.coerce.date(),
  type: z.enum(['maintenance', 'inspection']),
  asset_name: z.string(),
});

export type CalendarEvent = z.infer<typeof calendarEventSchema>;

// Pagination schemas
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  total: z.number().int().nonnegative(),
  total_pages: z.number().int().nonnegative(),
});

export type Pagination = z.infer<typeof paginationSchema>;