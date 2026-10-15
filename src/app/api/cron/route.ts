import { NextResponse } from "next/server";
import { getKlines } from "@/services/binance";
import { calculateIndicators } from "@/services/indicators";
import { analyzeScannerData } from "@/services/ai-analyzer";
import { evaluateSignals } from "../evaluate/route";
import { db } from "@/lib/firebase/client";
import { collection, addDoc, getDoc, doc } from "firebase/firestore";
import { getNextSignalId } from "@/services/signal-id";
import fs from "fs";
import path from "path";

// Timeframe padrão para o bot autônomo
const INTERVAL = "1h";

export async function GET(req: Request) {
  try {
    // Verifica se o robô está ligado no painel e pega as moedas configuradas
    const cronDoc = await getDoc(doc(db, "settings", "cron"));
    let targetCoins = ["BTCUSDT", "ETHUSDT", "NEARUSDT", "SUIUSDT"];

    if (cronDoc.exists()) {
      const data = cronDoc.data();
      if (data.isRunning === false) {
        console.log("[CRON] Robô está desligado no painel. Abortando execução.");
        return NextResponse.json({ success: true, message: "Robô em modo OFF." });
      }
      if (data.coins && Array.isArray(data.coins) && data.coins.length > 0) {
        targetCoins = data.coins;
      }
    }

    // Para evitar timeout na Vercel (10s), rodamos as promessas em paralelo
    const results = await Promise.allSettled(
      targetCoins.map(async (symbol) => {
        console.log(`[CRON] Iniciando scan autônomo para ${symbol}`);

        const klines = await getKlines(symbol, INTERVAL, 1000);
        const indicators = calculateIndicators(klines);

        // Avaliar Sessão e Horário de Mercado (BRT)
        const now = new Date();
        const brtString = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
        const brtDate = new Date(brtString);
        const day = brtDate.getDay();
        const hour = brtDate.getHours();

        let sessionName = "Horário Regular";
        let isHighRisk = false;
        let sessionWarning = "Volume e liquidez padrão.";

        if (day === 0 || day === 6) {
          sessionName = "Final de Semana";
          isHighRisk = true;
          sessionWarning = "Baixíssima liquidez institucional. Alto risco de manipulação e violino por baleias. Exija confluência máxima ou HOLD.";
        } else if (hour >= 9 && hour < 13) {
          sessionName = "Sobreposição Londres / NY (09h-13h BRT)";
          sessionWarning = "Alta liquidez institucional real. Ideal para rompimentos e pullbacks confirmados.";
        } else if (hour >= 14 && hour < 20) {
          sessionName = "Tarde / Consolidação (14h-20h BRT)";
          isHighRisk = true;
          sessionWarning = "Volume em queda pós-Europa. Alto índice de falsos rompimentos (fakeouts).";
        } else if (hour >= 21 || hour < 1) {
          sessionName = "Abertura Asiática (21h-01h BRT)";
          sessionWarning = "Volatilidade noturna asiática moderada a alta.";
        } else {
          sessionName = "Madrugada (01h-08h BRT)";
          isHighRisk = true;
          sessionWarning = "Baixo volume. Evite scalps arriscados.";
        }

        const technicalReport = `
          Moeda: ${symbol}
          Tempo Gráfico: ${INTERVAL}
          Preço Atual: $${indicators.currentPrice}
          Volume Atual: ${indicators.volume}

          **Sessão e Horário (Brasília):**
          - Horário: ${brtDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} | Sessão: ${sessionName}
          - Risco da Sessão: ${isHighRisk ? "ELEVADO (Redobrar cautela / priorizar HOLD)" : "NORMAL / ALTA LIQUIDEZ"}
          - Contexto: ${sessionWarning}

          **Indicadores Técnicos:**
          - RSI (14): ${indicators.rsi.toFixed(2)} ${indicators.rsi >= 45 && indicators.rsi <= 55 ? "(Zona Neutra / Choppy - Evitar entradas)" : ""}
          - MACD: Linha ${indicators.macd.MACD?.toFixed(2)}, Sinal ${indicators.macd.signal?.toFixed(2)}, Histograma ${indicators.macd.histogram?.toFixed(2)}
          - Bollinger Bands: Superior $${indicators.bollingerBands.upper.toFixed(2)}, Inferior $${indicators.bollingerBands.lower.toFixed(2)} (Largura: ${indicators.bollingerBandwidth.toFixed(2)}%)
          - EMA (7): $${indicators.ema7.toFixed(4)}
          - EMA (25): $${indicators.ema25.toFixed(4)}
          - EMA (99): $${indicators.ema99.toFixed(4)}
          - EMA (200) INSTITUCIONAL: $${indicators.ema200.toFixed(4)} -> Preço está ${indicators.currentPrice >= indicators.ema200 ? "ACIMA da 200 (Tendência Macro BULLISH)" : "ABAIXO da 200 (Tendência Macro BEARISH)"}
          - ATR (14) - Volatilidade Real: $${indicators.atr.toFixed(4)}
          - VWAP: $${indicators.vwap.toFixed(4)}
          - VPVR (Point of Control): $${indicators.vpvrPOC.toFixed(4)}

          **Parâmetros de Segurança Técnicos:**
          - Mercado em Consolidação: ${indicators.isConsolidating ? "SIM (ALTO RISCO DE LOSS - Priorizar HOLD)" : "NÃO (Tendência ativa)"}
          - Stop Loss Técnico Recomendado para COMPRA (com margem de ATR): $${indicators.recommendedBuySL.toFixed(4)}
          - Stop Loss Técnico Recomendado para VENDA (com margem de ATR): $${indicators.recommendedSellSL.toFixed(4)}

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
          Você é um Conselho Diretor de Elite focado em PRESERVAÇÃO DE CAPITAL e ALTA ASSERTIVIDADE.
          Agente 1: Especialista em curtos timeframes (10 a 30 min, 1h), buscando entradas seguras em pullback.
          Agente 2: Analista Master Institucional, focado em alta confluência e Smart Money Concepts.

          INSTRUÇÕES DOS AGENTES:
          [INSTRUÇÕES DO AGENTE 1]
          ${agent1Prompt}

          [INSTRUÇÕES DO AGENTE 2]
          ${agent2Prompt}

          DADOS TÉCNICOS ATUAIS PARA ANÁLISE:
          ${technicalReport}

          REGRAS CRÍTICAS DE PRESERVAÇÃO DE BANCA:
          1. Se o mercado estiver consolidando (RSI 45-55 ou Bandas comprimidas), responda HOLD. Ficar de fora é vitória.
          2. NUNCA dê sinal de BUY se o preço estiver abaixo da EMA 200.
          3. NUNCA dê sinal de SELL se o preço estiver acima da EMA 200.
          4. A entrada NUNCA deve ser a mercado no topo de vela esticada. Indique entrada na retração (Pullback na EMA 7 ou 25).
          5. O Stop Loss DEVE ter margem mínima de segurança de 1.5x ATR além do suporte/resistência para não ser estopado por pavios.

          SUA TAREFA:
          Analise os dados técnicos e formule um ÚNICO relatório consolidado com o formato abaixo:

          FORMATO OBRIGATÓRIO DE RESPOSTA:
          **Visão Geral e Sentimento:** [Descreva a estrutura do mercado, liquidez e se o mercado está em tendência ou picotado/choppy]
          
          **Confluência de Indicadores:** [Detalhes sobre RSI, MACD, Médias Móveis e ATR]
          
          **Ação Recomendada:** [BUY / SELL / HOLD]
          **Preço de Entrada:** [Preço com retração]
          **Confiança:** [0 a 100]%
          **Probabilidade de Sucesso:** [0 a 100]%
          **Razão Principal:** [Explicação direta]
          **Gatilhos de Confirmação:** [O que precisa acontecer para confirmar]
          **Stop Loss Sugerido:** [Preço seguro com margem de ATR]
          **Take Profit 1:** [Preço]
          **Take Profit 2:** [Preço]
          **Take Profit 3:** [Preço]
          **R/R:** [Ex: 1:2.5]
          **Tipo de Ordem:** [Limit / Market]
          **Tendência:** [Alta / Baixa / Lateral]
          **Prognóstico:** [Explicação resumida]
          
          **Dicas de Operação Institucional:**
          > [Plano de proteção de capital e gerenciamento de risco]
        `;

        const aiAnalysis = await analyzeScannerData(masterPrompt);

        let action = "HOLD";
        let confianca = 50;
        let precoEntrada = indicators.currentPrice;
        let stopLoss = indicators.recommendedBuySL;
        let takeProfit1 = indicators.currentPrice + (2 * indicators.atr);
        let takeProfit2 = indicators.currentPrice + (3 * indicators.atr);
        let takeProfit3 = indicators.currentPrice + (4 * indicators.atr);
        let rr = "1:2";
        let tipoOrdem = "Limit";
        let tendencia = indicators.trendBias === "ALTA_MACRO" ? "Alta" : "Baixa";
        let prognostico = "Aguardando confluência clara.";
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
            if (aiAnalysis.includes("HOLD")) action = "HOLD";
            else if (aiAnalysis.includes("BUY")) action = "BUY";
            else if (aiAnalysis.includes("SELL")) action = "SELL";
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
          action = "HOLD";
          confianca = 40;
          prognostico = "CRON: IA indisponível. Operação abortada para proteção da banca.";
        }

        // ==========================================
        // CAMADA DE BLINDAGEM DE CAPITAL (CRON SANITY)
        // ==========================================

        // 1. Filtro Anti-Choppy / Consolidação
        if (indicators.isConsolidating && confianca < 85) {
          action = "HOLD";
          prognostico = "MERCADO CONSOLIDADO/CHOOPY: Preservação de capital ativa. Aguardar rompimento com volume real.";
          confianca = Math.min(confianca, 55);
        }

        // 2. Filtro Institucional EMA 200 (Inquebrável)
        if (action === "BUY" && indicators.trendBias === "BAIXA_MACRO") {
          action = "HOLD";
          prognostico = "PROTEÇÃO: Preço abaixo da EMA 200. Proibido comprar contra a tendência macro de baixa.";
          confianca = Math.min(confianca, 55);
        }
        if (action === "SELL" && indicators.trendBias === "ALTA_MACRO") {
          action = "HOLD";
          prognostico = "PROTEÇÃO: Preço acima da EMA 200. Proibido vender contra a tendência macro de alta.";
          confianca = Math.min(confianca, 55);
        }

        // 3. Filtro de Fim de Semana / Horário de Risco Elevado
        if (isHighRisk && confianca < 85) {
          action = "HOLD";
          prognostico = `HORÁRIO DE ALTO RISCO (${sessionName}): Baixa liquidez institucional. Sinal desqualificado para proteção de banca.`;
          confianca = Math.min(confianca, 60);
        }

        // 4. Sanity Check de Stop Loss Anti-Violino (com ATR)
        if (action === "BUY") {
          if (stopLoss >= precoEntrada || (precoEntrada - stopLoss) < (0.8 * indicators.atr)) {
            stopLoss = indicators.recommendedBuySL;
          }
          if (takeProfit1 <= precoEntrada) {
            takeProfit1 = precoEntrada + (2.0 * indicators.atr);
            takeProfit2 = precoEntrada + (3.0 * indicators.atr);
            takeProfit3 = precoEntrada + (4.0 * indicators.atr);
          }
        } else if (action === "SELL") {
          if (stopLoss <= precoEntrada || (stopLoss - precoEntrada) < (0.8 * indicators.atr)) {
            stopLoss = indicators.recommendedSellSL;
          }
          if (takeProfit1 >= precoEntrada) {
            takeProfit1 = precoEntrada - (2.0 * indicators.atr);
            takeProfit2 = precoEntrada - (3.0 * indicators.atr);
            takeProfit3 = precoEntrada - (4.0 * indicators.atr);
          }
        }

        // Salvar no Firebase
        const signalId = await getNextSignalId();

        await addDoc(collection(db, "signals"), {
          signalId,
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
          const actionText = action === "BUY" ? "BUY (LONG)" : "SELL (SHORT)";
          const currentTime = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
          const tgMessage = `
<b>${icon} NOVO SINAL VIP (MASTER_CRIPTO)</b> ${icon}
<b>ID da Ordem:</b> #${signalId}
<b>Horário:</b> ${currentTime} | <b>Validade:</b> ${INTERVAL}

<b>Ativo:</b> #${symbol.replace("USDT", "")}
<b>Operação:</b> ${actionText}
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

    // Chama a auto-avaliação para verificar se alvos dos sinais anteriores foram alcançados
    try {
      await evaluateSignals();
      console.log("[CRON] Auto-avaliação concluída com sucesso.");
    } catch (e) {
      console.warn("[CRON] Erro ao auto-avaliar sinais:", e);
    }

    return NextResponse.json({ success: true, results });

  } catch (error: any) {
    console.error("[CRON] Erro interno:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
