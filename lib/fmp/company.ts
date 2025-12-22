import { prisma } from "@/lib/prisma";

const FMP_STABLE_BASE = "https://financialmodelingprep.com/stable";
const API_KEY = process.env.FMP_API_KEY!;

console.log("✅ lib/fmp/company.ts loaded — USING /stable/profile");

export async function syncCompany(rawTicker: string) {
  const ticker = rawTicker.toUpperCase();

  const url = `${FMP_STABLE_BASE}/profile?symbol=${encodeURIComponent(
    ticker
  )}&apikey=${API_KEY}`;

  console.log("➡️ FMP FETCH:", url);

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `FMP request failed for ${ticker} (${res.status} ${res.statusText}): ${text.slice(
        0,
        300
      )}`
    );
  }

  const data = await res.json();
  const profile = Array.isArray(data) ? data[0] : data?.[0];

  if (!profile) {
    throw new Error(`Company not found: ${ticker}`);
  }

  return prisma.company.upsert({
  where: { ticker },
  update: {
    name: profile.companyName ?? profile.name ?? ticker,
    description: profile.description ?? null,
    sector: profile.sector ?? null,
    industry: profile.industry ?? null,
    exchange: profile.exchangeShortName ?? profile.exchange ?? null,
    website: profile.website ?? null,
    logoUrl:
      profile.image ??
      `https://financialmodelingprep.com/image-stock/${ticker}.png`,
    ceo: profile.ceo ?? null,
    ipoDate: profile.ipoDate ?? null,
  },
  create: {
    ticker,
    name: profile.companyName ?? profile.name ?? ticker,
    description: profile.description ?? null,
    sector: profile.sector ?? null,
    industry: profile.industry ?? null,
    exchange: profile.exchangeShortName ?? profile.exchange ?? null,
    website: profile.website ?? null,
    logoUrl:
      profile.image ??
      `https://financialmodelingprep.com/image-stock/${ticker}.png`,
    ceo: profile.ceo ?? null,
    ipoDate: profile.ipoDate ?? null,
    },
  });
}
