"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import TickerTape from "@/components/tradingview/TickerTape";

const verbs = ["iew", "alue", "erify", "isualize"];

export default function Home() {
  const [index, setIndex] = useState(0);
  const [isSplit, setIsSplit] = useState(false);
  const [showNotice, setShowNotice] = useState(true); // State for the disclaimer
  const [hasEntered, setHasEntered] = useState(false);

  // Handle body scroll lock when notice is active
  useEffect(() => {
    if (showNotice) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
  }, [showNotice]);

  useEffect(() => {
    // We only start the animation logic once the notice is dismissed
    if (!showNotice) {
      // 1. Initial delay: V and Stocks split 1 second after entering
      const startTimeout = setTimeout(() => setIsSplit(true), 1000);

      const interval = setInterval(() => {
        setIndex((prev) => {
          const nextIndex = (prev + 1) % verbs.length;
          
          // 2. Loop Logic: After the 4th word, merge back, pause, then re-split
          if (nextIndex === 0) {
            setIsSplit(false); 
            setTimeout(() => setIsSplit(true), 1500);
          }
          return nextIndex;
        });
      }, 3000);

      return () => {
        clearTimeout(startTimeout);
        clearInterval(interval);
      };
    }
  }, [showNotice]); // This tells React to run the effect when showNotice changes

  const features = [
    { title: "Overview", desc: "Real-time key metrics and company snapshots.", icon: "📊" },
    { title: "Financials", desc: "Visual financial statements and trend flows.", icon: "📑" },
    { title: "Analysis", desc: "Adjustable DCF models and valuation ratios.", icon: "⚖️" },
    { title: "Report", desc: "Professional PDF summaries for deep research.", icon: "📝" },
  ];

  const popularStocks = [
    { ticker: "AAPL", logo: "/apple-logo.png" },
    { ticker: "MSFT", logo: "/microsoft-logo.png" },
    { ticker: "GOOGL", logo: "/google-logo.png" },
    { ticker: "AMZN", logo: "/amazon-logo.png" },
    { ticker: "TSLA", logo: "/tesla-logo.png" },
    { ticker: "META", logo: "/meta-logo.png" },
    { ticker: "NVDA", logo: "/nvidia-logo.png" },
    { ticker: "BRK-B", logo: "/berkshire-logo.png" },
  ];

  return (
    <main className="min-h-screen bg-white text-slate-900 font-sans selection:bg-blue-500/30 overflow-x-hidden">
      <TickerTape/>
      {/* PROFESSIONAL BETA NOTICE MODAL */}
      <AnimatePresence>
        {showNotice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="max-w-lg w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider rounded border border-blue-200">
                    Beta Version
                  </div>
                </div>
                
                <h2 className="text-2xl font-bold text-slate-900 mb-4">Welcome to VStocks!</h2>
                
                <div className="space-y-4 text-slate-600 leading-relaxed text-sm md:text-base">
                  <p>
                    Thank you for visiting VStocksData.com. Please note that you are accessing an early-stage beta version of our platform.
                  </p>
                  <p>
                    As we continue to build, you may encounter missing data for certain companies or features that are still in development. Your presence here is invaluable; simply by exploring the site, you are helping us optimize our systems to provide more precise and comprehensive financial data in the near future.
                  </p>
                  <p className="italic text-xs text-slate-400">
                    Disclaimer: This site is for informational purposes only and does not constitute financial advice.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowNotice(false);
                    setHasEntered(true);
                  }}
                  className="w-full mt-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20"
                >
                  Enter Site
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. HERO SECTION - Deep Navy Brand Anchor */}
      <section className="relative pt-32 pb-32 px-6 flex flex-col items-center bg-[#0a192f] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/40 via-transparent to-transparent -z-10" />

        <motion.div layout className="flex items-center justify-center text-6xl md:text-8xl font-extrabold tracking-tighter mb-8 overflow-visible">
          <motion.div layout className="flex items-center overflow-visible">
            <motion.span animate={{ x: isSplit ? 0 : 40 }} transition={{ type: "spring", stiffness: 150, damping: 20 }} className="text-green-400 z-10">V</motion.span>
            <motion.div animate={{ width: isSplit ? "auto" : 0, opacity: isSplit ? 1 : 0 }} transition={{ type: "spring", stiffness: 150, damping: 20 }} className="relative flex items-center h-32 overflow-visible"> 
              <AnimatePresence mode="wait">
                {isSplit && (
                  <motion.span
                    key={verbs[index]}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -30 }}
                    transition={{ opacity: { duration: 0.2 }, y: { type: "spring", stiffness: 200, damping: 20 } }}
                    className="text-green-300 font-bold text-6xl md:text-8xl italic whitespace-nowrap -ml-1 md:-ml-3 mr-4 md:mr-8"
                  >
                    {verbs[index]}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
            <motion.span animate={{ x: isSplit ? 0 : 43 }} transition={{ type: "spring", stiffness: 150, damping: 20 }} className="text-white">Stocks</motion.span>
          </motion.div>
        </motion.div>

        <motion.p 
          initial={{ opacity: 0, y: 10 }}
          // animate based on hasEntered, NOT isSplit
          animate={hasEntered ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          // Ensures it stays up or pops back immediately on scroll
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 1 }}
          transition={{ duration: 0.8, delay: 2 }} // Delay slightly so it follows the split
          className="text-xl text-green-100/80 max-w-3xl text-center leading-relaxed mb-10">
          <span className="text-green-400 font-semibold">Stock data and analysis</span>, presented visually and designed to be easily understood 
        </motion.p>
      </section>

      {/* 2. CORE FEATURES - Clean White / Light Grey Utility Section */}
      <section className="py-24 bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <Card className="h-full border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-500 bg-white group">
                <CardContent className="p-8 text-center sm:text-left">
                  <div className="text-4xl mb-6 group-hover:scale-110 transition-transform duration-300">{f.icon}</div>
                  <h3 className="text-xl font-bold mb-3 text-slate-900">{f.title}</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 3. SHOWCASE SECTIONS - Standardized Deep Navy */}
      
      {/* Adjustable DCF */}
      <section className="py-24 bg-[#0a192f] text-white border-b border-white/5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1/2 h-full bg-blue-500/5 blur-[120px] -z-10" />
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
          <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <span className="text-blue-400 font-bold tracking-widest text-xs uppercase mb-4 block px-3 py-1 bg-blue-400/10 w-fit rounded-md border border-blue-400/20">Interactive Valuation</span>
            <h2 className="text-4xl font-extrabold mb-6 leading-tight">Adjustable DCF Models</h2>
            <p className="text-blue-100/70 text-lg leading-relaxed mb-8">Take control of the valuation narrative. Adjust key assumptions like revenue growth and discount rates to see fair value changes instantly.</p>
            <div className="flex flex-wrap gap-3">
              <span className="bg-blue-600 px-5 py-2.5 rounded-full text-xs md:text-sm font-bold text-white shadow-lg shadow-blue-600/30">Real-time Recalculation</span>
              <span className="bg-blue-600 px-5 py-2.5 rounded-full text-xs md:text-sm font-bold text-white shadow-lg shadow-blue-600/30">Dynamic Assumption Adjusting</span>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="flex flex-col gap-4">
             <Image src="/DCFBar.png" alt="DCF Valuation Bar" width={700} height={200} className="rounded-xl shadow-2xl border border-white/10" />
             <Image src="/DCFGrid_.png" alt="DCF Assumptions Grid" width={700} height={300} className="rounded-xl shadow-2xl border border-white/10" />
          </motion.div>
        </div>
      </section>

      {/* Visual Analyst Insights */}
      <section className="py-24 bg-[#0a192f] border-b border-white/5 relative">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-indigo-500/5 blur-[120px] -z-10" />
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
          <motion.div className="lg:order-2" initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <span className="text-indigo-400 font-bold tracking-widest text-xs uppercase mb-4 block px-3 py-1 bg-indigo-400/10 w-fit rounded-md border border-indigo-400/20">Market Sentiment</span>
            <h2 className="text-4xl font-extrabold mb-6 leading-tight text-white">Visual Analyst Insights</h2>
            <p className="text-blue-100/70 text-lg leading-relaxed mb-8">We aggregate analyst consensus into intuitive visual gauges. Get an instant pulse on Wall Street narrative with sentiment trends and EPS estimates.</p>
            <div className="flex flex-wrap gap-3">
              <span className="bg-indigo-600 px-5 py-2.5 rounded-full text-xs md:text-sm font-bold text-white shadow-lg shadow-indigo-600/30">Analyst Rating Gauges</span>
              <span className="bg-indigo-600 px-5 py-2.5 rounded-full text-xs md:text-sm font-bold text-white shadow-lg shadow-indigo-600/30">EPS Surprise Trends</span>
            </div>
          </motion.div>
          <motion.div className="lg:order-1" initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
             <Image src="/Analyst.png" alt="Analyst Sentiment Gauges" width={700} height={450} className="rounded-xl shadow-2xl border border-white/10" />
          </motion.div>
        </div>
      </section>

      {/* Visual Financial Statements */}
      <section className="py-24 bg-[#0a192f] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-emerald-500/5 blur-[120px] -z-10" />
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
          <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <span className="text-emerald-400 font-bold tracking-widest text-xs uppercase mb-4 block px-3 py-1 bg-emerald-400/10 w-fit rounded-md border border-emerald-400/20">Historical Deep Dive</span>
            <h2 className="text-4xl font-extrabold mb-6 leading-tight text-white">Visual Financial Statements</h2>
            <p className="text-blue-100/70 text-lg leading-relaxed mb-8">Track revenue, net income, and cash flow through visualized <strong>YoY and QoQ historical trends</strong> to identify patterns at a glance.</p>
            <div className="flex flex-wrap gap-3">
              <span className="bg-emerald-500 px-5 py-2.5 rounded-full text-xs md:text-sm font-bold text-slate-900 shadow-lg shadow-emerald-500/30">Visualized Income Flows</span>
              <span className="bg-emerald-500 px-5 py-2.5 rounded-full text-xs md:text-sm font-bold text-slate-900 shadow-lg shadow-emerald-500/30">YoY & QoQ Growth</span>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="relative">
             <Image src="/Sankey_.png" alt="Visual Financial Statements" width={700} height={450} className="rounded-xl shadow-2xl border border-slate-700" />
          </motion.div>
        </div>
      </section>

      {/* 4. POPULAR STOCKS - Crisp White Utility Section */}
      <section className="py-24 bg-white border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-12 text-slate-800 uppercase tracking-widest">Analyze Popular Tickers</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {popularStocks.map((stock) => (
              <Link key={stock.ticker} href={`/company/${stock.ticker}`}>
                <Card className="cursor-pointer border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-400 transition-all duration-300 group bg-white">
                  <CardContent className="p-6 flex flex-col items-center justify-center h-32">
                    <div className="h-12 flex items-center justify-center mb-3">
                      <Image src={stock.logo} alt={stock.ticker} width={40} height={40} className="object-contain" />
                    </div>
                    <span className="text-xs font-bold tracking-widest text-slate-500 group-hover:text-blue-600 transition-colors uppercase">{stock.ticker}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
