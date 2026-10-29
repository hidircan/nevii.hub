"use client";

import { useState } from "react";
import type { SiteContent } from "@/lib/site-locales";

type PricingChrome = SiteContent["pricingChrome"];

export type PricingPlanView = {
  key: string;
  label: string;
  description: string | null;
  limits: { students: number | null; users: number | null; branches: number | null };
  moduleLabels: string[];
  customQuote: boolean;
  savingsPercent: number | null;
  monthly: { amountMinor: number; displayTotal: string; approved: boolean; sandbox: boolean; taxNote: string };
  yearly: {
    amountMinor: number;
    displayTotal: string;
    displayMonthlyEquivalent: string | null;
    approved: boolean;
    sandbox: boolean;
    taxNote: string;
  };
};

function limitText(n: number | null, ad: string, unlimited: string): string {
  return n === null ? `${unlimited} ${ad}` : `${n} ${ad}`;
}

function PlanCard({
  plan,
  interval,
  chrome,
  featured,
}: {
  plan: PricingPlanView;
  interval: "monthly" | "yearly";
  chrome: PricingChrome;
  /** Ortadaki (önerilen) paket öne çıkar. */
  featured: boolean;
}) {
  const price = interval === "yearly" ? plan.yearly : plan.monthly;
  const buyHref = `/satin-al?plan=${encodeURIComponent(plan.key)}&interval=${interval}`;
  const quoteHref = `/teklif?plan=${encodeURIComponent(plan.key)}`;
  const limits = [
    limitText(plan.limits.students, chrome.students, chrome.unlimited),
    limitText(plan.limits.users, chrome.users, chrome.unlimited),
    limitText(plan.limits.branches, chrome.branches, chrome.unlimited),
  ];
  return (
    <li
      className={`nh-lift relative flex flex-col rounded-3xl p-7 ${
        featured
          ? "bg-white shadow-xl shadow-amber-900/10 ring-2 ring-amber-500 lg:-my-3 lg:py-10"
          : "bg-white/80 shadow-sm ring-1 ring-slate-200 hover:shadow-lg"
      }`}
    >
      {featured ? (
        <span className="absolute -top-3 left-7 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-950 shadow-sm">
          Önerilen
        </span>
      ) : null}
      <h3 className="text-xl font-semibold text-slate-900">{plan.label}</h3>
      {plan.description ? <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{plan.description}</p> : null}
      <div className="mt-6">
        {plan.customQuote ? (
          <p className="text-3xl font-semibold tracking-tight text-slate-900">{chrome.customQuote}</p>
        ) : (
          <>
            <p className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">{price.displayTotal}</span>
              <span className="text-sm text-slate-500">/ {interval === "yearly" ? chrome.perYear : chrome.perMonth}</span>
            </p>
            {interval === "yearly" && plan.yearly.displayMonthlyEquivalent ? (
              <p className="mt-1 text-sm text-slate-500">
                {chrome.yearlyNote.replace("{equiv}", plan.yearly.displayMonthlyEquivalent)}
              </p>
            ) : null}
            {interval === "yearly" && plan.savingsPercent !== null ? (
              <p className="mt-2 inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                {chrome.savings.replace("{pct}", String(plan.savingsPercent))}
              </p>
            ) : null}
            {price.sandbox && price.amountMinor === 0 ? (
              <p className="mt-1 text-xs font-medium text-slate-500">{chrome.sandboxZero}</p>
            ) : null}
          </>
        )}
      </div>
      {!price.approved && !plan.customQuote ? (
        <p className="mt-2 text-sm font-medium text-amber-800">{chrome.notApproved}</p>
      ) : null}
      <p className="mt-2 text-xs leading-relaxed text-slate-500">{price.taxNote}</p>
      <ul className="mt-5 flex flex-wrap gap-1.5">
        {limits.map((l) => (
          <li key={l} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {l}
          </li>
        ))}
      </ul>
      <ul className="mt-5 space-y-2 border-t border-slate-100 pt-5 text-sm text-slate-700">
        {plan.moduleLabels.slice(0, 6).map((m) => (
          <li key={m} className="flex gap-2.5">
            <svg aria-hidden viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 8.5 3.5 3.5L13 4.5" />
            </svg>
            <span>{m}</span>
          </li>
        ))}
        {plan.moduleLabels.length > 6 ? (
          <li className="pl-6.5 text-slate-500">{chrome.moreModules.replace("{n}", String(plan.moduleLabels.length - 6))}</li>
        ) : null}
      </ul>
      <div className="mt-auto flex flex-col gap-2 pt-7">
        {!plan.customQuote ? (
          <a
            href={buyHref}
            aria-disabled={!price.approved}
            onClick={price.approved ? undefined : (e) => e.preventDefault()}
            className={
              price.approved
                ? `rounded-full px-5 py-3 text-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                    featured ? "bg-amber-600 text-white hover:bg-amber-700" : "bg-slate-900 text-white hover:bg-slate-700"
                  }`
                : "cursor-not-allowed rounded-full bg-slate-100 px-5 py-3 text-center text-sm font-semibold text-slate-400"
            }
          >
            {chrome.buy}
          </a>
        ) : null}
        <a
          href={quoteHref}
          className="rounded-full px-5 py-3 text-center text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          {chrome.quote}
        </a>
      </div>
    </li>
  );
}

export function PricingPlans({
  plans,
  demo,
  chrome,
}: {
  plans: PricingPlanView[];
  demo: boolean;
  chrome: PricingChrome;
}) {
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  return (
    <div>
      <div className="mx-auto mt-8 flex max-w-xs items-center justify-center gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200" role="group" aria-label={chrome.periodLabel}>
        {(["monthly", "yearly"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={interval === v}
            onClick={() => setInterval(v)}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 ${
              interval === v ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {v === "monthly" ? chrome.monthly : chrome.yearly}
          </button>
        ))}
      </div>
      {demo ? (
        <p className="mx-auto mt-4 max-w-2xl rounded-xl bg-slate-50 px-4 py-2.5 text-center text-sm text-slate-600 ring-1 ring-slate-200">
          {chrome.demoNote}
        </p>
      ) : null}
      <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
        <p className="text-sm text-slate-700">
          {chrome.trialTeaser}
        </p>
        <a
          href="/deneme"
          className="mt-3 inline-block rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
        >
          {chrome.trialCta}
        </a>
      </div>
      <ul className="mt-12 grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p, i) => (
          <PlanCard
            key={p.key}
            plan={p}
            interval={interval}
            chrome={chrome}
            featured={plans.length >= 3 && i === 1 && !p.customQuote && p.monthly.approved && p.monthly.amountMinor > 0}
          />
        ))}
      </ul>
    </div>
  );
}
