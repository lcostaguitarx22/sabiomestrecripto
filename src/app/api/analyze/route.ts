import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getKlines } from "@/services/binance";
import { calculateIndicators } from "@/services/indicators";
import { analyzeScannerData } from "@/services/ai-analyzer";
import { db } from "@/lib/firebase/client";
import { collection, addDoc } from "firebase/firestore";

export async function POST(req: Request) {
  try {
    const { symbol, interval } = await req.json();

    if (!symbol || !interval) {
      return NextResponse.json({ error: "Faltam parâmetros: symbol, interval" }, { status: 400 });
    }

    console.log(`[API] Iniciando análise para ${symbol} (${interval})`);

    // 1. Buscar Histórico da Binance (1000 candles para dar "warm-up" nas EMAs e RSI e ficar igual ao gráfico)
    const klines = await getKlines(symbol, interval, 1000);

    // 2. Calcular Indicadores Matemáticos
    const indicators = calculateIndicators(klines);

    // 3. Montar o Relatório Técnico para a IA
    const technicalReport = `
      Moeda: ${symbol}
      Tempo Gráfico: ${interval}
      Preço Atual: $${indicators.currentPrice}
      Volume Atual: ${indicators.volume}

      **Indicadores Técnicos:**
      - RSI (14): ${indicators.rsi.toFixed(2)}
      - MACD: Linha ${indicators.macd.MACD?.toFixed(2)}, Sinal ${indicators.macd.signal?.toFixed(2)}, Histograma ${indicators.macd.histogram?.toFixed(2)}
      - Bollinger Bands: Superior $${indicators.bollingerBands.upper.toFixed(2)}, Inferior $${indicators.bollingerBands.lower.toFixed(2)}
      - EMA (7): $${indicators.ema7.toFixed(4)}
      - EMA (25): $${indicators.ema25.toFixed(4)}
      - EMA (99): $${indicators.ema99.toFixed(4)}
      - EMA (200): $${indicators.ema200.toFixed(4)}
      - VWAP: $${indicators.vwap.toFixed(4)}
      - VPVR (Point of Control): $${indicators.vpvrPOC.toFixed(4)}

      **Ação de Preço (Price Action):**
      - Padrões Detectados: ${indicators.patterns.length > 0 ? indicators.patterns.join(", ") : "Nenhum padrão claro"}
      - Suporte Base (Mínima Recente): $${indicators.support.toFixed(4)}
      - Resistência Base (Máxima Recente): $${indicators.resistance.toFixed(4)}
    `;

    console.log("[API] Indicadores calculados. Chamando IA...");

    // 4. Integração com Agentes Autônomos (IA)
    console.log("[API] Lendo prompts dos Agentes Autônomos...");
    const promptsDir = path.join(process.cwd(), "src", "agents", "prompts");
    
    let agent1Prompt = "";
    let agent2Prompt = "";
    try {
      agent1Prompt = fs.readFileSync(path.join(promptsDir, "short_timeframe_agent.md"), "utf8");
      agent2Prompt = fs.readFileSync(path.join(promptsDir, "institutional_master_agent.md"), "utf8");
    } catch (e) {
      console.warn("Aviso: Falha ao ler arquivos dos agentes. Verifique se os arquivos existem em src/agents/prompts.");
    }

    const masterPrompt = `
      Você é um Conselho Diretor formado por dois especialistas em criptomoedas.
      Agente 1: Especialista em curtos timeframes (10 a 30 min), buscando entradas rápidas.
      Agente 2: Analista Master Institucional, focado em alta confluência e Smart Money Concepts.

      INSTRUÇÕES DOS AGENTES:
      [INSTRUÇÕES DO AGENTE 1]
      ${agent1Prompt}

      [INSTRUÇÕES DO AGENTE 2]
      ${agent2Prompt}

      DADOS TÉCNICOS ATUAIS PARA ANÁLISE:
      ${technicalReport}

      SUA TAREFA:
      Analise os dados técnicos fornecidos e combine o rigor institucional do Agente 2 com a agilidade do Agente 1.
      Formule um ÚNICO relatório consolidado que deve, obrigatoriamente, conter as seções abaixo em Markdown.

      FORMATO OBRIGATÓRIO DE RESPOSTA:
      **Visão Geral e Sentimento:** [Descreva a estrutura do mercado, liquidez e sentimento geral]
      
      **Confluência de Indicadores:** [Detalhes sobre RSI, MACD, Médias Móveis]
      
      **Ação Recomendada:** [BUY / SELL / HOLD]
      **Preço de Entrada:** [Preço]
      **Confiança:** [0 a 100]%
      **Probabilidade de Sucesso:** [0 a 100]%
      **Razão Principal:** [Explicação direta]
      **Gatilhos de Confirmação:** [O que precisa acontecer para confirmar]
      **Stop Loss Sugerido:** [Preço]
      **Take Profit 1:** [Preço]
      **Take Profit 2:** [Preço]
      **Take Profit 3:** [Preço]
      **R/R:** [Ex: 1:3]
      **Tipo de Ordem:** [Market / Limit]
      **Tendência:** [Alta / Baixa / Lateral]
      **Prognóstico:** [Explicação resumida]
      
      **Dicas de Operação Institucional:**
      > [Descreva o plano de Trade com base em SMC ou Price action]
    `;

    console.log("[API] Chamando a Inteligência Artificial com os Agentes...");
    const aiAnalysis = await analyzeScannerData(masterPrompt, 3); // 3 retries
    
    // Default fallback values
    let action = "HOLD";
    let confianca = 50;
    let precoEntrada = indicators.currentPrice;
    let stopLoss = indicators.support * 0.995;
    let takeProfit1 = indicators.resistance * 0.995;
    let takeProfit2 = takeProfit1;
    let takeProfit3 = takeProfit1;
    let rr = "-";
    let tipoOrdem = "-";
    let tendencia = "-";
    let prognostico = "-";
    let message = aiAnalysis || "Erro ao gerar análise (Serviço da IA Indisponível após várias tentativas).";

    if (aiAnalysis) {
      // Helper function for regex
      const extractFloat = (regex: RegExp, fallback: number) => {
        const match = aiAnalysis.match(regex);
        return match ? parseFloat(match[1].replace(/,/g, '')) : fallback;
      };
      const extractString = (regex: RegExp, fallback: string) => {
        const match = aiAnalysis.match(regex);
        return match ? match[1].trim() : fallback;
      };

      const actionMatch = aiAnalysis.match(/\*\*Ação Recomendada:\*\*\s*(BUY|SELL|HOLD)/i);
      if (actionMatch) {
        action = actionMatch[1].toUpperCase();
      } else {
        if (aiAnalysis.includes("BUY")) action = "BUY";
        if (aiAnalysis.includes("SELL")) action = "SELL";
      }

      confianca = extractFloat(/\*\*Confiança:\*\*\s*(\d+)/i, confianca);
      precoEntrada = extractFloat(/\*\*Preço de Entrada:\*\*\s*\$?\s*([\d,.]+)/i, precoEntrada);
      stopLoss = extractFloat(/\*\*Stop Loss Sugerido:\*\*\s*\$?\s*([\d,.]+)/i, stopLoss);
      takeProfit1 = extractFloat(/\*\*Take Profit 1:\*\*\s*\$?\s*([\d,.]+)/i, takeProfit1);
      takeProfit2 = extractFloat(/\*\*Take Profit 2:\*\*\s*\$?\s*([\d,.]+)/i, takeProfit2);
      takeProfit3 = extractFloat(/\*\*Take Profit 3:\*\*\s*\$?\s*([\d,.]+)/i, takeProfit3);
      rr = extractString(/\*\*R\/R:\*\*\s*(.+)/i, rr);
      tipoOrdem = extractString(/\*\*Tipo de Ordem:\*\*\s*(.+)/i, tipoOrdem);
      tendencia = extractString(/\*\*Tendência:\*\*\s*(.+)/i, tendencia);
      prognostico = extractString(/\*\*Prognóstico:\*\*\s*(.+)/i, prognostico);

    } else {
       if (indicators.rsi < 40 && indicators.macd.histogram && indicators.macd.histogram > 0) { action = "BUY"; confianca = 75; }
       if (indicators.rsi > 60 && indicators.macd.histogram && indicators.macd.histogram < 0) { action = "SELL"; confianca = 75; }
    }

    let parsedDecision = {
      action,
      confidenceScore: confianca,
      precoEntrada,
      stopLoss,
      takeProfit1,
      takeProfit2,
      takeProfit3,
      rr,
      tipoOrdem,
      tendencia,
      prognostico,
      message
    };

    // 5. Salvar no Firebase
    const docRef = await addDoc(collection(db, "signals"), {
      symbol,
      interval,
      price: indicators.currentPrice,
      action: parsedDecision.action,
      score: parsedDecision.confidenceScore,
      precoEntrada: parsedDecision.precoEntrada,
      stopLoss: parsedDecision.stopLoss,
      takeProfit1: parsedDecision.takeProfit1,
      takeProfit2: parsedDecision.takeProfit2,
      takeProfit3: parsedDecision.takeProfit3,
      rr: parsedDecision.rr,
      tipoOrdem: parsedDecision.tipoOrdem,
      tendencia: parsedDecision.tendencia,
      prognostico: parsedDecision.prognostico,
      message: parsedDecision.message,
      indicators: {
        rsi: indicators.rsi,
        macd: indicators.macd.MACD,
        support: indicators.support,
        resistance: indicators.resistance
      },
      status: "OPEN",
      createdAt: new Date().toISOString()
    });

    console.log(`[API] Sinal salvo com sucesso no Firebase. ID: ${docRef.id}`);

    // 6. Retornar Sucesso
    return NextResponse.json({ success: true, id: docRef.id, data: parsedDecision });

  } catch (error: any) {
    console.error("[API Analyze] Erro interno:", error);
    return NextResponse.json({ error: error.message || "Erro desconhecido" }, { status: 500 });
  }
}
