import { NextResponse } from "next/server";
import { getKlines } from "@/services/binance";
import { calculateIndicators } from "@/services/indicators";
import { analyzeScannerData } from "@/services/ai-analyzer";
import { db } from "@/lib/firebase/client";
import { collection, addDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";

// Array de moedas que o robô vai varrer automaticamente
const TARGET_COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "NEARUSDT"];
const INTERVAL = "1h"; // Timeframe padrão para o bot autônomo

export async function GET(req: Request) {
  try {
    // Para evitar timeout na Vercel (10s), rodamos as promessas em paralelo
    const results = await Promise.allSettled(
      TARGET_COINS.map(async (symbol) => {
        console.log(`[CRON] Iniciando scan autônomo para ${symbol}`);
        
        const klines = await getKlines(symbol, INTERVAL, 1000);
        const indicators = calculateIndicators(klines);

        const technicalReport = `
          Moeda: ${symbol}
          Tempo Gráfico: ${INTERVAL}
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

        const promptsDir = path.join(process.cwd(), "src", "agents", "prompts");
        let agent1Prompt = "";
        let agent2Prompt = "";
        try {
          agent1Prompt = fs.readFileSync(path.join(promptsDir, "short_timeframe_agent.md"), "utf8");
          agent2Prompt = fs.readFileSync(path.join(promptsDir, "institutional_master_agent.md"), "utf8");
        } catch (e) {
          console.warn("[CRON] Falha ao ler arquivos de prompt.");
        }

        const masterPrompt = `
          Você é um Conselho Diretor formado por dois especialistas em criptomoedas.
          Agente 1: Especialista em curtos timeframes (10 a 30 min, 1h), buscando entradas rápidas.
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
          > [Plano de trade SMC, Zonas de Liquidez, orientações de risco]
        `;

        const aiAnalysis = await analyzeScannerData(masterPrompt);

        let action = "HOLD";
        let confianca = 0;
        let precoEntrada = 0;
        let stopLoss = 0;
        let takeProfit1 = 0;
        let takeProfit2 = 0;
        let takeProfit3 = 0;
        let rr = "-";
        let tipoOrdem = "-";
        let tendencia = "-";
        let prognostico = "-";
        let message = aiAnalysis || "Erro ao gerar análise na CRON.";

        if (aiAnalysis) {
          const extractFloat = (regex: RegExp, fallback: number) => {
            const match = aiAnalysis.match(regex);
            if (!match) return fallback;
            let strVal = match[1];
            if (strVal.includes('.') && strVal.includes(',')) {
               strVal = strVal.replace(/\./g, '').replace(',', '.');
            } 
            else if (strVal.includes(',') && !strVal.includes('.')) {
               strVal = strVal.replace(',', '.');
            }
            return parseFloat(strVal) || fallback;
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
        }

        // Salvar no Firebase
        await addDoc(collection(db, "signals"), {
          symbol,
          interval: INTERVAL,
          price: indicators.currentPrice,
          action,
          score: confianca,
          precoEntrada,
          stopLoss,
          takeProfit1,
          takeProfit2,
          takeProfit3,
          rr,
          tipoOrdem,
          tendencia,
          prognostico,
          message,
          indicators: {
            rsi: indicators.rsi,
            macd: indicators.macd.MACD,
            support: indicators.support,
            resistance: indicators.resistance
          },
          status: "OPEN",
          createdAt: new Date().toISOString()
        });

        // Disparo Telegram
        if ((action === "BUY" || action === "SELL") && confianca >= 80) {
          const icon = action === "BUY" ? "🟢" : "🔴";
          const tgMessage = `
<b>${icon} NOVO SINAL VIP (CRON AUTOMÁTICO)</b> ${icon}
<b>Ativo:</b> #${symbol.replace("USDT", "")}
<b>Operação:</b> ${action}
<b>Confiança:</b> ${confianca}% 🔥
<b>Tempo Gráfico:</b> ${INTERVAL}

<b>Entrada Ideal:</b> $${precoEntrada}
<b>Stop Loss:</b> $${stopLoss}
<b>Alvos:</b>
🎯 TP1: $${takeProfit1}
🎯 TP2: $${takeProfit2}
🚀 TP3: $${takeProfit3}

<b>R/R Esperado:</b> ${rr}
<b>Estratégia:</b> ${prognostico}
          `;
          
          const telegram = await import('@/services/telegram');
          await telegram.sendTelegramAlert(tgMessage.trim());
        }
        
        return { symbol, status: 'success', action, confianca };
      })
    );

    return NextResponse.json({ success: true, results });

  } catch (error: any) {
    console.error("[CRON] Erro interno:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
