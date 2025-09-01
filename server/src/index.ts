import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  loginInputSchema,
  createUserInputSchema,
  updateUserInputSchema,
  createAssetInputSchema,
  updateAssetInputSchema,
  assetFilterSchema,
  createComplaintInputSchema,
  updateComplaintInputSchema,
  createMaintenanceScheduleInputSchema,
  updateMaintenanceScheduleInputSchema,
  createAssetHistoryInputSchema,
  reportFilterSchema,
  aiSuggestionInputSchema,
  createUserActivityLogInputSchema,
} from './schema';

// Import handlers
import { login, getCurrentUser } from './handlers/auth';
import { createUser, getUsers, getUserById, updateUser, deleteUser } from './handlers/users';
import {
  createAsset,
  getAssets,
  getAssetById,
  getAssetByQrCode,
  updateAsset,
  deleteAsset,
  getArchivedAssets,
  restoreAsset,
  permanentDeleteAsset,
} from './handlers/assets';
import {
  createComplaint,
  getComplaints,
  getComplaintsByAssetId,
  getComplaintById,
  updateComplaint,
  getPendingComplaints,
} from './handlers/complaints';
import {
  createMaintenanceSchedule,
  getMaintenanceSchedules,
  getMaintenanceSchedulesByAssetId,
  getUpcomingMaintenance,
  updateMaintenanceSchedule,
  getCalendarEvents,
  markMaintenanceCompleted,
} from './handlers/maintenance';
import {
  createAssetHistory,
  getAssetHistory,
  logStatusChange,
  logMaintenanceActivity,
  logComplaintResolution,
} from './handlers/asset_history';
import {
  generateAssetReport,
  getAssetReportData,
  generateComplaintReport,
  generateMaintenanceReport,
} from './handlers/reports';
import { getAiSuggestions, analyzeAssetCondition, predictMaintenanceNeeds, getReplacementRecommendation } from './handlers/ai_suggestions';
import {
  getDashboardStats,
  getAssetsByCondition,
  getAssetsByCategory,
  getComplaintStatistics,
  getMaintenanceStatistics,
  getMonthlyAssetTrends,
} from './handlers/dashboard';
import {
  createUserActivityLog,
  getUserActivityLogs,
  getRecentActivity,
  logUserAction,
} from './handlers/user_activity_logs';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  login: publicProcedure
    .input(loginInputSchema)
    .mutation(({ input }) => login(input)),
  
  getCurrentUser: publicProcedure
    .input(z.number())
    .query(({ input }) => getCurrentUser(input)),

  // User management routes (Admin only)
  createUser: publicProcedure
    .input(createUserInputSchema)
    .mutation(({ input }) => createUser(input)),

  getUsers: publicProcedure
    .query(() => getUsers()),

  getUserById: publicProcedure
    .input(z.number())
    .query(({ input }) => getUserById(input)),

  updateUser: publicProcedure
    .input(updateUserInputSchema)
    .mutation(({ input }) => updateUser(input)),

  deleteUser: publicProcedure
    .input(z.number())
    .mutation(({ input }) => deleteUser(input)),

  // Asset management routes
  createAsset: publicProcedure
    .input(createAssetInputSchema)
    .mutation(({ input }) => createAsset(input)),

  getAssets: publicProcedure
    .input(assetFilterSchema.optional())
    .query(({ input }) => getAssets(input)),

  getAssetById: publicProcedure
    .input(z.number())
    .query(({ input }) => getAssetById(input)),

  getAssetByQrCode: publicProcedure
    .input(z.string())
    .query(({ input }) => getAssetByQrCode(input)),

  updateAsset: publicProcedure
    .input(updateAssetInputSchema)
    .mutation(({ input }) => updateAsset(input)),

  deleteAsset: publicProcedure
    .input(z.number())
    .mutation(({ input }) => deleteAsset(input)),

  getArchivedAssets: publicProcedure
    .query(() => getArchivedAssets()),

  restoreAsset: publicProcedure
    .input(z.number())
    .mutation(({ input }) => restoreAsset(input)),

  permanentDeleteAsset: publicProcedure
    .input(z.number())
    .mutation(({ input }) => permanentDeleteAsset(input)),

  // Complaint management routes
  createComplaint: publicProcedure
    .input(createComplaintInputSchema)
    .mutation(({ input }) => createComplaint(input)),

  getComplaints: publicProcedure
    .query(() => getComplaints()),

  getComplaintsByAssetId: publicProcedure
    .input(z.number())
    .query(({ input }) => getComplaintsByAssetId(input)),

  getComplaintById: publicProcedure
    .input(z.number())
    .query(({ input }) => getComplaintById(input)),

  updateComplaint: publicProcedure
    .input(updateComplaintInputSchema)
    .mutation(({ input }) => updateComplaint(input)),

  getPendingComplaints: publicProcedure
    .query(() => getPendingComplaints()),

  // Maintenance management routes
  createMaintenanceSchedule: publicProcedure
    .input(createMaintenanceScheduleInputSchema)
    .mutation(({ input }) => createMaintenanceSchedule(input)),

  getMaintenanceSchedules: publicProcedure
    .query(() => getMaintenanceSchedules()),

  getMaintenanceSchedulesByAssetId: publicProcedure
    .input(z.number())
    .query(({ input }) => getMaintenanceSchedulesByAssetId(input)),

  getUpcomingMaintenance: publicProcedure
    .query(() => getUpcomingMaintenance()),

  updateMaintenanceSchedule: publicProcedure
    .input(updateMaintenanceScheduleInputSchema)
    .mutation(({ input }) => updateMaintenanceSchedule(input)),

  getCalendarEvents: publicProcedure
    .query(() => getCalendarEvents()),

  markMaintenanceCompleted: publicProcedure
    .input(z.number())
    .mutation(({ input }) => markMaintenanceCompleted(input)),

  // Asset history routes
  createAssetHistory: publicProcedure
    .input(createAssetHistoryInputSchema)
    .mutation(({ input }) => createAssetHistory(input)),

  getAssetHistory: publicProcedure
    .input(z.number())
    .query(({ input }) => getAssetHistory(input)),

  logStatusChange: publicProcedure
    .input(z.object({
      assetId: z.number(),
      oldStatus: z.string(),
      newStatus: z.string(),
      changedBy: z.number().optional(),
    }))
    .mutation(({ input }) => logStatusChange(input.assetId, input.oldStatus, input.newStatus, input.changedBy)),

  logMaintenanceActivity: publicProcedure
    .input(z.object({
      assetId: z.number(),
      description: z.string(),
      changedBy: z.number(),
    }))
    .mutation(({ input }) => logMaintenanceActivity(input.assetId, input.description, input.changedBy)),

  logComplaintResolution: publicProcedure
    .input(z.object({
      assetId: z.number(),
      complaintId: z.number(),
      changedBy: z.number(),
    }))
    .mutation(({ input }) => logComplaintResolution(input.assetId, input.complaintId, input.changedBy)),

  // Reporting routes
  generateAssetReport: publicProcedure
    .input(reportFilterSchema)
    .mutation(({ input }) => generateAssetReport(input)),

  getAssetReportData: publicProcedure
    .input(reportFilterSchema)
    .query(({ input }) => getAssetReportData(input)),

  generateComplaintReport: publicProcedure
    .input(reportFilterSchema)
    .mutation(({ input }) => generateComplaintReport(input)),

  generateMaintenanceReport: publicProcedure
    .input(reportFilterSchema)
    .mutation(({ input }) => generateMaintenanceReport(input)),

  // AI suggestion routes
  getAiSuggestions: publicProcedure
    .input(aiSuggestionInputSchema)
    .query(({ input }) => getAiSuggestions(input)),

  analyzeAssetCondition: publicProcedure
    .input(z.number())
    .query(({ input }) => analyzeAssetCondition(input)),

  predictMaintenanceNeeds: publicProcedure
    .input(z.number())
    .query(({ input }) => predictMaintenanceNeeds(input)),

  getReplacementRecommendation: publicProcedure
    .input(z.number())
    .query(({ input }) => getReplacementRecommendation(input)),

  // Dashboard routes
  getDashboardStats: publicProcedure
    .query(() => getDashboardStats()),

  getAssetsByCondition: publicProcedure
    .query(() => getAssetsByCondition()),

  getAssetsByCategory: publicProcedure
    .query(() => getAssetsByCategory()),

  getComplaintStatistics: publicProcedure
    .query(() => getComplaintStatistics()),

  getMaintenanceStatistics: publicProcedure
    .query(() => getMaintenanceStatistics()),

  getMonthlyAssetTrends: publicProcedure
    .query(() => getMonthlyAssetTrends()),

  // User activity log routes (Admin only)
  createUserActivityLog: publicProcedure
    .input(createUserActivityLogInputSchema)
    .mutation(({ input }) => createUserActivityLog(input)),

  getUserActivityLogs: publicProcedure
    .input(z.number().optional())
    .query(({ input }) => getUserActivityLogs(input)),

  getRecentActivity: publicProcedure
    .input(z.number().optional())
    .query(({ input }) => getRecentActivity(input)),

  logUserAction: publicProcedure
    .input(z.object({
      userId: z.number(),
      action: z.string(),
      resourceType: z.string(),
      resourceId: z.number().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => logUserAction(
      input.userId,
      input.action,
      input.resourceType,
      input.resourceId,
      input.description
    )),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`SIAC TRPC server listening at port: ${port}`);
  console.log(`Sistema Inventaris Aset Cerdas API ready!`);
}

start();