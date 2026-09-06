// app/api/report/route.ts
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { ticker, companyData } = body;

  if (!ticker) {
    return new Response(JSON.stringify({ error: "Missing ticker" }), { status: 400 });
  }

  const {
    name,
    sector,
    industry,
    description,
    exchange,
    ceo,
    ipoDate,
    price,
    change,
    changePercent,
    marketCap,
    revenue,
    netIncome,
    netProfitMargin,
    pe,
    fairValue,
    upsidePct,
    verdict,
    revenueGrowth,
    operatingMargin,
    grossMargin,
    roe,
    currentRatio,
    debtToEquity,
    analystScore,
    analystDominant,
    strongBuy,
    buy,
    hold,
    sell,
    strongSell,
  } = companyData ?? {};

  const systemPrompt = `You are a senior equity research analyst at a top-tier investment bank. 
You write professional, data-driven stock analysis reports that are precise, insightful, and actionable.
Your reports are structured, well-reasoned, and avoid generic filler language.
You speak with authority but acknowledge uncertainty where it exists.
Format your response using clean markdown with headers (##), bold for key terms, and bullet points where appropriate.
Do not use excessive disclaimers. Be direct and analytical.`;

  const userPrompt = `Write a comprehensive equity research report for ${name} (${ticker}) traded on ${exchange ?? "a major exchange"}.

## Company Context
- Sector: ${sector ?? "N/A"} | Industry: ${industry ?? "N/A"}
- CEO: ${ceo ?? "N/A"} | IPO Date: ${ipoDate ?? "N/A"}
- Description: ${description ?? "No description available."}

## Market Data
- Current Price: $${price ?? "N/A"}
- Daily Change: ${change != null ? `$${change.toFixed(2)} (${changePercent?.toFixed(2)}%)` : "N/A"}
- Market Cap: ${marketCap != null ? `$${(marketCap / 1e9).toFixed(2)}B` : "N/A"}
- P/E Ratio: ${pe?.toFixed(2) ?? "N/A"}

## Financial Performance (Latest Annual)
- Revenue: ${revenue != null ? `$${(revenue / 1e9).toFixed(2)}B` : "N/A"}
- Net Income: ${netIncome != null ? `$${(netIncome / 1e9).toFixed(2)}B` : "N/A"}
- Net Profit Margin: ${netProfitMargin != null ? `${(netProfitMargin * 100).toFixed(2)}%` : "N/A"}
- Gross Margin: ${grossMargin != null ? `${grossMargin.toFixed(2)}%` : "N/A"}
- Operating Margin: ${operatingMargin != null ? `${operatingMargin.toFixed(2)}%` : "N/A"}
- Revenue Growth (YoY): ${revenueGrowth != null ? `${revenueGrowth.toFixed(2)}%` : "N/A"}
- Return on Equity: ${roe != null ? `${roe.toFixed(2)}%` : "N/A"}

## Balance Sheet & Leverage
- Current Ratio: ${currentRatio?.toFixed(2) ?? "N/A"}
- Debt to Equity: ${debtToEquity?.toFixed(2) ?? "N/A"}

## Valuation (DCF Model)
- DCF Fair Value: ${fairValue != null ? `$${fairValue.toFixed(2)}` : "N/A"}
- Upside/Downside: ${upsidePct != null ? `${upsidePct.toFixed(1)}%` : "N/A"}
- Verdict: ${verdict ?? "N/A"}

## Analyst Sentiment
- Consensus Score: ${analystScore != null ? analystScore.toFixed(2) : "N/A"} (scale -2 to +2)
- Dominant Rating: ${analystDominant ?? "N/A"}
- Breakdown: Strong Buy: ${strongBuy ?? 0}, Buy: ${buy ?? 0}, Hold: ${hold ?? 0}, Sell: ${sell ?? 0}, Strong Sell: ${strongSell ?? 0}

---

Write the report with the following sections:

## Executive Summary
A 3-4 sentence overview capturing the investment thesis — what kind of company this is, its current financial standing, and a clear directional take (bullish / neutral / bearish) based on the data.

## Business Overview & Competitive Position
Analyze the business model, sector dynamics, and any competitive moat implied by the margins and growth rates. Reference the industry and CEO tenure if relevant.

## Financial Performance Analysis
Deep dive into the revenue, margins, and profitability trends. Highlight what the numbers suggest about operational efficiency and trajectory.

## Valuation Assessment
Analyze the DCF result versus current market price. Discuss whether the stock appears fairly valued, overvalued, or undervalued relative to its fundamentals. Reference the P/E in context.

## Analyst Sentiment & Market Consensus
Interpret the analyst rating breakdown. What does the consensus suggest? Note if there's disagreement between the DCF model and analyst consensus.

## Key Risks
3-5 specific, data-informed risks for this company based on the financials (e.g., high debt, margin compression, slowing growth, valuation premium).

## Key Catalysts
3-5 potential upside catalysts specific to this company and sector.

## Investment Verdict
A clear, direct closing verdict: Buy / Hold / Sell with a one-paragraph justification tied to the data above. Include a 12-month price target range if the data supports it.`;

// 1. Updated Fetch for OpenRouter
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000", // Optional
      "X-Title": "VStocks Analysis", // Optional
    },
    body: JSON.stringify({
      model: "openrouter/auto", // Or your preferred model
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "Unknown error");
    return new Response(JSON.stringify({ error: err }), { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              // 2. Updated parsing path for OpenRouter/OpenAI format
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(content));
              }
            } catch {
              // Skip incomplete JSON chunks
            }
          }
        }
      } catch (e) {
        controller.error(e);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
