import { db } from '../db';
import { assetsTable, complaintsTable, maintenanceSchedulesTable, assetHistoryTable } from '../db/schema';
import { eq, and, desc, count } from 'drizzle-orm';
import { type AiSuggestionInput, type AiSuggestion } from '../schema';

const GEMINI_API_KEY = 'AIzaSyD9NSNND9Xwr7a_PRJP2ubziI2xmkIRiCI';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

export async function getAiSuggestions(input: AiSuggestionInput): Promise<AiSuggestion> {
  try {
    // Fetch asset details
    const asset = await db.select()
      .from(assetsTable)
      .where(eq(assetsTable.id, input.asset_id))
      .execute();

    if (!asset.length) {
      throw new Error(`Asset with ID ${input.asset_id} not found`);
    }

    const assetData = asset[0];

    // Fetch related data
    const [complaints, maintenanceRecords, historyRecords] = await Promise.all([
      // Get complaint count and recent complaints
      db.select({ count: count() })
        .from(complaintsTable)
        .where(eq(complaintsTable.asset_id, input.asset_id))
        .execute(),

      // Get maintenance history
      db.select()
        .from(maintenanceSchedulesTable)
        .where(eq(maintenanceSchedulesTable.asset_id, input.asset_id))
        .orderBy(desc(maintenanceSchedulesTable.scheduled_date))
        .limit(5)
        .execute(),

      // Get asset history
      db.select()
        .from(assetHistoryTable)
        .where(eq(assetHistoryTable.asset_id, input.asset_id))
        .orderBy(desc(assetHistoryTable.created_at))
        .limit(10)
        .execute()
    ]);

    // Calculate asset age in years
    const assetAge = Math.floor((Date.now() - assetData.created_at.getTime()) / (1000 * 60 * 60 * 24 * 365));
    const complaintCount = complaints[0]?.count || 0;

    // Create comprehensive prompt for Gemini
    const prompt = createAssetAnalysisPrompt(assetData, {
      age: assetAge,
      complaintCount,
      maintenanceRecords,
      historyRecords
    });

    // Get AI analysis from Gemini
    const aiResponse = await callGeminiAPI(prompt);

    // Parse the structured response
    return parseAiResponse(aiResponse);

  } catch (error) {
    console.error('AI suggestions generation failed:', error);
    throw error;
  }
}

export async function analyzeAssetCondition(assetId: number): Promise<string> {
  try {
    const asset = await db.select()
      .from(assetsTable)
      .where(eq(assetsTable.id, assetId))
      .execute();

    if (!asset.length) {
      throw new Error(`Asset with ID ${assetId} not found`);
    }

    const assetData = asset[0];
    const prompt = `Analisis kondisi asset berikut:
- Nama: ${assetData.name}
- Kategori: ${assetData.category}
- Kondisi saat ini: ${assetData.condition}
- Owner: ${assetData.owner}
- Deskripsi: ${assetData.description || 'Tidak ada deskripsi'}

Berikan analisis mendalam tentang kondisi asset ini dalam bahasa Indonesia. Fokus pada:
1. Status kondisi saat ini
2. Potensi masalah yang mungkin terjadi
3. Rekomendasi perawatan jangka pendek`;

    return await callGeminiAPI(prompt);
  } catch (error) {
    console.error('Asset condition analysis failed:', error);
    throw error;
  }
}

export async function predictMaintenanceNeeds(assetId: number): Promise<string> {
  try {
    const asset = await db.select()
      .from(assetsTable)
      .where(eq(assetsTable.id, assetId))
      .execute();

    if (!asset.length) {
      throw new Error(`Asset with ID ${assetId} not found`);
    }

    const assetData = asset[0];
    
    // Get recent maintenance history
    const maintenanceHistory = await db.select()
      .from(maintenanceSchedulesTable)
      .where(eq(maintenanceSchedulesTable.asset_id, assetId))
      .orderBy(desc(maintenanceSchedulesTable.scheduled_date))
      .limit(5)
      .execute();

    const assetAge = Math.floor((Date.now() - assetData.created_at.getTime()) / (1000 * 60 * 60 * 24 * 365));

    const prompt = `Prediksi kebutuhan perawatan untuk asset:
- Nama: ${assetData.name}
- Kategori: ${assetData.category}
- Kondisi: ${assetData.condition}
- Umur asset: ${assetAge} tahun
- Riwayat perawatan terakhir: ${maintenanceHistory.length} kali perawatan

Berikan prediksi kebutuhan perawatan dalam bahasa Indonesia meliputi:
1. Timeline perawatan yang disarankan
2. Jenis perawatan yang diperlukan
3. Estimasi biaya relatif (rendah/sedang/tinggi)
4. Prioritas perawatan`;

    return await callGeminiAPI(prompt);
  } catch (error) {
    console.error('Maintenance prediction failed:', error);
    throw error;
  }
}

export async function getReplacementRecommendation(assetId: number): Promise<string> {
  try {
    const asset = await db.select()
      .from(assetsTable)
      .where(eq(assetsTable.id, assetId))
      .execute();

    if (!asset.length) {
      throw new Error(`Asset with ID ${assetId} not found`);
    }

    const assetData = asset[0];
    
    // Get complaint and maintenance data
    const [complaints, maintenance] = await Promise.all([
      db.select({ count: count() })
        .from(complaintsTable)
        .where(eq(complaintsTable.asset_id, assetId))
        .execute(),
      
      db.select({ count: count() })
        .from(maintenanceSchedulesTable)
        .where(eq(maintenanceSchedulesTable.asset_id, assetId))
        .execute()
    ]);

    const assetAge = Math.floor((Date.now() - assetData.created_at.getTime()) / (1000 * 60 * 60 * 24 * 365));
    const complaintCount = complaints[0]?.count || 0;
    const maintenanceCount = maintenance[0]?.count || 0;

    const prompt = `Analisis rekomendasi penggantian asset:
- Nama: ${assetData.name}
- Kategori: ${assetData.category}
- Kondisi: ${assetData.condition}
- Umur: ${assetAge} tahun
- Total keluhan: ${complaintCount}
- Total perawatan: ${maintenanceCount}

Berikan rekomendasi penggantian dalam bahasa Indonesia meliputi:
1. Apakah asset perlu diganti atau masih layak diperbaiki
2. Timeline penggantian yang disarankan
3. Faktor ekonomis (biaya perbaikan vs penggantian)
4. Dampak terhadap produktivitas
5. Alternatif solusi`;

    return await callGeminiAPI(prompt);
  } catch (error) {
    console.error('Replacement recommendation failed:', error);
    throw error;
  }
}

export async function callGeminiAPI(prompt: string): Promise<string> {
  try {
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content: {
          parts: Array<{
            text: string;
          }>;
        };
      }>;
    };
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No response generated from Gemini API');
    }

    return data.candidates[0].content.parts[0].text;

  } catch (error) {
    console.error('Gemini API call failed:', error);
    throw error;
  }
}

// Helper function to create comprehensive asset analysis prompt
function createAssetAnalysisPrompt(asset: any, context: any): string {
  return `Analisis komprehensif asset management untuk asset berikut:

INFORMASI ASSET:
- Nama: ${asset.name}
- Kategori: ${asset.category}
- Kondisi saat ini: ${asset.condition}
- Owner: ${asset.owner}
- Umur asset: ${context.age} tahun
- Deskripsi: ${asset.description || 'Tidak ada deskripsi'}
- Status arsip: ${asset.is_archived ? 'Diarsipkan' : 'Aktif'}

RIWAYAT OPERASIONAL:
- Total keluhan: ${context.complaintCount}
- Riwayat perawatan: ${context.maintenanceRecords.length} record
- Riwayat perubahan: ${context.historyRecords.length} record

Berikan analisis dalam format JSON dengan struktur berikut (dalam bahasa Indonesia):
{
  "feasibility": "Analisis kelayakan asset untuk penggunaan berkelanjutan",
  "maintenance_prediction": "Prediksi kebutuhan perawatan dan timeline",
  "replacement_recommendation": "Rekomendasi penggantian atau perpanjangan masa pakai"
}

Pastikan setiap field berisi analisis mendalam dan actionable insights untuk manajemen asset yang efektif.`;
}

// Helper function to parse AI response into structured format
function parseAiResponse(response: string): AiSuggestion {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        feasibility: parsed.feasibility || 'Analisis kelayakan tidak tersedia',
        maintenance_prediction: parsed.maintenance_prediction || 'Prediksi perawatan tidak tersedia',
        replacement_recommendation: parsed.replacement_recommendation || 'Rekomendasi penggantian tidak tersedia'
      };
    }
  } catch (error) {
    console.warn('Failed to parse structured JSON response, using fallback parsing');
  }

  // Fallback: parse unstructured response
  const lines = response.split('\n').filter(line => line.trim());
  
  return {
    feasibility: extractSection(lines, ['feasibility', 'kelayakan']) || 'Asset dalam kondisi yang memerlukan evaluasi lebih lanjut',
    maintenance_prediction: extractSection(lines, ['maintenance', 'perawatan', 'prediction']) || 'Perawatan rutin disarankan sesuai jadwal standar',
    replacement_recommendation: extractSection(lines, ['replacement', 'penggantian', 'recommendation']) || 'Evaluasi penggantian perlu dilakukan berdasarkan analisis biaya-manfaat'
  };
}

// Helper function to extract sections from unstructured text
function extractSection(lines: string[], keywords: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (keywords.some(keyword => line.includes(keyword))) {
      // Return this line and potentially next few lines as the content
      const content = lines.slice(i, Math.min(i + 3, lines.length)).join(' ');
      return content.replace(/^[^:]*:?\s*/, '').trim();
    }
  }
  return null;
}