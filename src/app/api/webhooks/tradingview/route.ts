import { NextResponse } from 'next/server';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { analyzeSignal } from '@/services/ai-analyzer';
import { getSymbolPrice } from '@/services/binance';

// Webhook payload type from TradingView
interface TradingViewPayload {
  symbol: string;
  action: 'BUY' | 'SELL';
  price?: number;
  message?: string;
  secret?: string; // For security
}

export async function POST(request: Request) {
  try {
    const payload: TradingViewPayload = await request.json();

    // Basic validation
    if (!payload.symbol || !payload.action) {
      return NextResponse.json({ error: 'Missing symbol or action' }, { status: 400 });
    }

    // 1. Fetch current price from Binance if not provided
    let currentPrice = payload.price;
    if (!currentPrice) {
      const binancePrice = await getSymbolPrice(payload.symbol);
      currentPrice = binancePrice ?? 0;
    }

    // 2. Pass data to Gemini AI Analyzer
    const aiAnalysis = await analyzeSignal(
      payload.symbol,
      payload.action,
      currentPrice,
      payload.message
    );

    // 3. Save the result to Firebase Firestore (Using Client SDK instead of Admin SDK)
    const signalData = {
      symbol: payload.symbol,
      action: payload.action,
      price: currentPrice,
      message: payload.message || '',
      timestamp: new Date().toISOString(),
      aiAnalysis: aiAnalysis || null,
      status: 'PROCESSED'
    };

    const docRef = await addDoc(collection(db, 'signals'), signalData);

    return NextResponse.json({ success: true, id: docRef.id, data: signalData }, { status: 201 });
  } catch (error) {
    console.error('Error processing TradingView Webhook:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

