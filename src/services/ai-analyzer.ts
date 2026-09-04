import { GoogleGenAI } from '@google/genai';

// Initialize the Google Gen AI SDK
// It automatically picks up the GEMINI_API_KEY from the environment
const ai = new GoogleGenAI();

export interface AiAnalysisResult {
  sentimentScore: number; // 0 (Bearish) to 100 (Bullish)
  prediction: string;
  reasoning: string;
}

export async function analyzeSignal(
  symbol: string,
  signalAction: string,
  currentPrice: number,
  additionalContext: string = ''
): Promise<AiAnalysisResult | null> {
  try {
    const prompt = `
      Você é um especialista financeiro em criptomoedas.
      Acabamos de receber um sinal de "${signalAction}" para o par "${symbol}" ao preço de $${currentPrice}.
      Contexto adicional: ${additionalContext}
      
      Por favor, analise a situação atual e responda EXATAMENTE neste formato JSON, sem crases markdown ou texto extra:
      {
        "sentimentScore": [número de 0 a 100, onde 0 é extremo medo/baixa e 100 é extrema ganância/alta],
        "prediction": "[Curta frase dizendo o que você espera que aconteça no curto prazo]",
        "reasoning": "[Justificativa detalhada de 2 a 3 frases explicando o raciocínio]"
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const text = response.text;
    if (text) {
      const parsed = JSON.parse(text);
      return parsed as AiAnalysisResult;
    }
    
    return null;
  } catch (error) {
    console.error('Error analyzing signal with Gemini:', error);
    return null;
  }
}

export async function analyzeScannerData(prompt: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[AI Analyzer] Chamando Gemini API (Tentativa ${i + 1}/${retries})...`);
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
      });

      const text = response.text;
      if (text) {
        return text;
      }
      return null;
    } catch (error: any) {
      console.error(`[AI Analyzer] Erro na tentativa ${i + 1}:`, error.message);
      if (i === retries - 1) {
        return null;
      }
      // Wait before retrying (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
  return null;
}
