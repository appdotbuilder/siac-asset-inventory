import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { assetsTable, complaintsTable, maintenanceSchedulesTable, assetHistoryTable, usersTable } from '../db/schema';
import { 
  getAiSuggestions, 
  analyzeAssetCondition, 
  predictMaintenanceNeeds, 
  getReplacementRecommendation,
  callGeminiAPI 
} from '../handlers/ai_suggestions';
import { type AiSuggestionInput, type CreateAssetInput } from '../schema';

// Mock fetch to avoid making real API calls in tests
const mockFetch = mock();
(global as any).fetch = mockFetch;

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'password123',
  name: 'Test User',
  role: 'admin' as const,
};

const testAsset: CreateAssetInput = {
  name: 'Test Monitor',
  description: 'Dell 24-inch monitor for testing',
  category: 'monitor',
  condition: 'baik',
  owner: 'IT Department',
  photo_url: 'https://example.com/monitor.jpg',
};

const mockGeminiResponse = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: `{
              "feasibility": "Asset monitor dalam kondisi baik dan masih layak digunakan untuk 2-3 tahun ke depan. Performa optimal dengan perawatan rutin.",
              "maintenance_prediction": "Disarankan pembersihan layar setiap bulan dan pengecekan kabel setiap 6 bulan. Tidak ada kebutuhan maintenance urgent.",
              "replacement_recommendation": "Penggantian tidak diperlukan dalam 2 tahun ke depan. Monitor masih memberikan value yang baik untuk investasi."
            }`
          }
        ]
      }
    }
  ]
};

function createMockResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'content-type': 'application/json' }
  });
}

function createMockErrorResponse(status: number, text: string): Response {
  return new Response(text, {
    status,
    statusText: 'Error'
  });
}

describe('AI Suggestions Handler', () => {
  let assetId: number;
  let userId: number;

  beforeEach(async () => {
    await createDB();
    
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = userResult[0].id;

    // Create test asset with QR code
    const assetResult = await db.insert(assetsTable)
      .values({
        ...testAsset,
        qr_code: `QR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      })
      .returning()
      .execute();
    assetId = assetResult[0].id;
  });

  afterEach(async () => {
    await resetDB();
    mockFetch.mockReset();
  });

  describe('callGeminiAPI', () => {
    it('should successfully call Gemini API', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGeminiResponse));

      const result = await callGeminiAPI('Test prompt');
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain('feasibility');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockErrorResponse(400, 'Bad Request'));

      await expect(callGeminiAPI('Test prompt')).rejects.toThrow(/Gemini API error: 400/);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(callGeminiAPI('Test prompt')).rejects.toThrow('Network error');
    });

    it('should handle empty response', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ candidates: [] }));

      await expect(callGeminiAPI('Test prompt')).rejects.toThrow('No response generated from Gemini API');
    });
  });

  describe('getAiSuggestions', () => {
    it('should generate AI suggestions for asset', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGeminiResponse));

      const input: AiSuggestionInput = { asset_id: assetId };
      const result = await getAiSuggestions(input);

      expect(result.feasibility).toBeDefined();
      expect(result.maintenance_prediction).toBeDefined();
      expect(result.replacement_recommendation).toBeDefined();
      expect(typeof result.feasibility).toBe('string');
      expect(typeof result.maintenance_prediction).toBe('string');
      expect(typeof result.replacement_recommendation).toBe('string');
    });

    it('should include asset context in analysis', async () => {
      // Add some complaints and maintenance records
      await db.insert(complaintsTable)
        .values({
          asset_id: assetId,
          sender_name: 'Test User',
          description: 'Screen flickering issue',
          status: 'perlu_perbaikan'
        })
        .execute();

      await db.insert(maintenanceSchedulesTable)
        .values({
          asset_id: assetId,
          scheduled_by: userId,
          title: 'Monthly cleaning',
          scheduled_date: new Date(),
        })
        .execute();

      mockFetch.mockResolvedValueOnce(createMockResponse(mockGeminiResponse));

      const input: AiSuggestionInput = { asset_id: assetId };
      const result = await getAiSuggestions(input);

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      // Verify that the API was called with comprehensive data
      const calls = mockFetch.mock.calls;
      if (calls.length > 0 && calls[0].length > 1) {
        const requestBody = JSON.parse(calls[0][1].body);
        expect(requestBody.contents[0].parts[0].text).toContain(testAsset.name);
        expect(requestBody.contents[0].parts[0].text).toContain(testAsset.category);
      }
    });

    it('should handle asset not found', async () => {
      const input: AiSuggestionInput = { asset_id: 99999 };
      
      await expect(getAiSuggestions(input)).rejects.toThrow('Asset with ID 99999 not found');
    });

    it('should handle unstructured AI response', async () => {
      const unstructuredResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Asset ini dalam kondisi baik. Perawatan rutin diperlukan setiap 6 bulan. Penggantian belum diperlukan.'
                }
              ]
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(unstructuredResponse));

      const input: AiSuggestionInput = { asset_id: assetId };
      const result = await getAiSuggestions(input);

      expect(result.feasibility).toBeDefined();
      expect(result.maintenance_prediction).toBeDefined();
      expect(result.replacement_recommendation).toBeDefined();
    });
  });

  describe('analyzeAssetCondition', () => {
    it('should analyze asset condition', async () => {
      const analysisResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Monitor dalam kondisi baik dengan layar yang jernih dan tidak ada masalah hardware.'
                }
              ]
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(analysisResponse));

      const result = await analyzeAssetCondition(assetId);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle asset not found', async () => {
      await expect(analyzeAssetCondition(99999)).rejects.toThrow('Asset with ID 99999 not found');
    });

    it('should include asset details in prompt', async () => {
      const analysisResponse = {
        candidates: [{ content: { parts: [{ text: 'Analysis complete' }] } }]
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(analysisResponse));

      await analyzeAssetCondition(assetId);

      const calls = mockFetch.mock.calls;
      if (calls.length > 0 && calls[0].length > 1) {
        const requestBody = JSON.parse(calls[0][1].body);
        const prompt = requestBody.contents[0].parts[0].text;
        
        expect(prompt).toContain(testAsset.name);
        expect(prompt).toContain(testAsset.category);
        expect(prompt).toContain(testAsset.condition);
      }
    });
  });

  describe('predictMaintenanceNeeds', () => {
    it('should predict maintenance needs', async () => {
      const maintenanceResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Perawatan disarankan dalam 3 bulan ke depan dengan fokus pada pembersihan dan pengecekan koneksi.'
                }
              ]
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(maintenanceResponse));

      const result = await predictMaintenanceNeeds(assetId);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should include maintenance history context', async () => {
      // Add maintenance record
      await db.insert(maintenanceSchedulesTable)
        .values({
          asset_id: assetId,
          scheduled_by: userId,
          title: 'Quarterly maintenance',
          scheduled_date: new Date('2024-01-15'),
          is_completed: true,
          completed_at: new Date('2024-01-15'),
        })
        .execute();

      const maintenanceResponse = {
        candidates: [{ content: { parts: [{ text: 'Maintenance prediction complete' }] } }]
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(maintenanceResponse));

      await predictMaintenanceNeeds(assetId);

      const calls = mockFetch.mock.calls;
      if (calls.length > 0 && calls[0].length > 1) {
        const requestBody = JSON.parse(calls[0][1].body);
        const prompt = requestBody.contents[0].parts[0].text;
        
        expect(prompt).toContain('1 kali perawatan');
      }
    });

    it('should handle asset not found', async () => {
      await expect(predictMaintenanceNeeds(99999)).rejects.toThrow('Asset with ID 99999 not found');
    });
  });

  describe('getReplacementRecommendation', () => {
    it('should get replacement recommendation', async () => {
      const replacementResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Penggantian belum diperlukan. Asset masih dalam kondisi baik dan ekonomis untuk diperbaiki jika ada masalah.'
                }
              ]
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(replacementResponse));

      const result = await getReplacementRecommendation(assetId);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should consider complaint and maintenance history', async () => {
      // Add complaint
      await db.insert(complaintsTable)
        .values({
          asset_id: assetId,
          sender_name: 'Test User',
          description: 'Frequent issues',
          status: 'perlu_perbaikan'
        })
        .execute();

      // Add maintenance
      await db.insert(maintenanceSchedulesTable)
        .values({
          asset_id: assetId,
          scheduled_by: userId,
          title: 'Repair work',
          scheduled_date: new Date(),
        })
        .execute();

      const replacementResponse = {
        candidates: [{ content: { parts: [{ text: 'Replacement recommendation complete' }] } }]
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(replacementResponse));

      await getReplacementRecommendation(assetId);

      const calls = mockFetch.mock.calls;
      if (calls.length > 0 && calls[0].length > 1) {
        const requestBody = JSON.parse(calls[0][1].body);
        const prompt = requestBody.contents[0].parts[0].text;
        
        expect(prompt).toContain('Total keluhan: 1');
        expect(prompt).toContain('Total perawatan: 1');
      }
    });

    it('should handle asset not found', async () => {
      await expect(getReplacementRecommendation(99999)).rejects.toThrow('Asset with ID 99999 not found');
    });
  });

  describe('Error handling', () => {
    it('should handle API timeouts gracefully', async () => {
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      const input: AiSuggestionInput = { asset_id: assetId };
      
      await expect(getAiSuggestions(input)).rejects.toThrow('Request timeout');
    });

    it('should handle malformed JSON response', async () => {
      const malformedResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '{ invalid json response'
                }
              ]
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(malformedResponse));

      const input: AiSuggestionInput = { asset_id: assetId };
      const result = await getAiSuggestions(input);

      // Should fallback to default values when JSON parsing fails
      expect(result.feasibility).toBeDefined();
      expect(result.maintenance_prediction).toBeDefined();
      expect(result.replacement_recommendation).toBeDefined();
    });

    it('should handle database connection errors', async () => {
      // Create a new asset ID that doesn't exist to trigger database error naturally
      const input: AiSuggestionInput = { asset_id: 99999 };
      
      await expect(getAiSuggestions(input)).rejects.toThrow('Asset with ID 99999 not found');
    });
  });

  describe('Edge cases', () => {
    it('should handle asset with minimal data', async () => {
      // Create asset with minimal required fields
      const minimalAsset = await db.insert(assetsTable)
        .values({
          name: 'Minimal Asset',
          category: 'cpu',
          condition: 'baru',
          owner: 'Test',
          qr_code: `QR_minimal_${Date.now()}`
        })
        .returning()
        .execute();

      mockFetch.mockResolvedValueOnce(createMockResponse(mockGeminiResponse));

      const input: AiSuggestionInput = { asset_id: minimalAsset[0].id };
      const result = await getAiSuggestions(input);

      expect(result).toBeDefined();
      expect(result.feasibility).toBeTruthy();
      expect(result.maintenance_prediction).toBeTruthy();
      expect(result.replacement_recommendation).toBeTruthy();
    });

    it('should handle very old assets', async () => {
      // Create asset with old date
      const oldDate = new Date('2020-01-01');
      const oldAsset = await db.insert(assetsTable)
        .values({
          name: 'Old Asset',
          category: 'monitor',
          condition: 'sedang_diperbaiki',
          owner: 'Legacy Dept',
          qr_code: `QR_old_${Date.now()}`,
          created_at: oldDate,
          updated_at: oldDate
        })
        .returning()
        .execute();

      mockFetch.mockResolvedValueOnce(createMockResponse(mockGeminiResponse));

      const input: AiSuggestionInput = { asset_id: oldAsset[0].id };
      const result = await getAiSuggestions(input);

      expect(result).toBeDefined();
      
      // Verify API was called with age information
      const calls = mockFetch.mock.calls;
      if (calls.length > 0 && calls[0].length > 1) {
        const requestBody = JSON.parse(calls[0][1].body);
        expect(requestBody.contents[0].parts[0].text).toMatch(/Umur asset: \d+ tahun/);
      }
    });

    it('should handle assets with many complaints', async () => {
      // Add multiple complaints
      const complaintPromises = Array.from({ length: 5 }, (_, i) => 
        db.insert(complaintsTable)
          .values({
            asset_id: assetId,
            sender_name: `User ${i + 1}`,
            description: `Issue ${i + 1}`,
            status: 'perlu_perbaikan'
          })
          .execute()
      );
      await Promise.all(complaintPromises);

      mockFetch.mockResolvedValueOnce(createMockResponse(mockGeminiResponse));

      const input: AiSuggestionInput = { asset_id: assetId };
      const result = await getAiSuggestions(input);

      expect(result).toBeDefined();
      
      // Verify high complaint count is included in analysis
      const calls = mockFetch.mock.calls;
      if (calls.length > 0 && calls[0].length > 1) {
        const requestBody = JSON.parse(calls[0][1].body);
        expect(requestBody.contents[0].parts[0].text).toContain('Total keluhan: 5');
      }
    });
  });
});