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
}: {
  plan: PricingPlanView;
  interval: "monthly" | "yearly";
  chrome: PricingChrome;
}) {
  const price = interval === "yearly" ? plan.yearly : plan.monthly;
  const buyHref = `/satin-al?plan=${encodeURIComponent(plan.key)}&interval=${interval}`;
  const quoteHref = `/teklif?plan=${encodeURIComponent(plan.key)}`;
  return (
    <li className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">{plan.label}</h3>
      {plan.description ? <p className="mt-1 text-sm text-slate-600">{plan.description}</p> : null}
      <div className="mt-4">
        {plan.customQuote ? (
          <p className="text-2xl font-semibold text-slate-900">{chrome.customQuote}</p>
        ) : (
          <>
            <p className="text-2xl font-semibold text-slate-900">
              {price.displayTotal}
              <span className="ml-1 text-sm font-normal text-slate-500">
                / {interval === "yearly" ? chrome.perYear : chrome.perMonth}
              </span>
            </p>
            {interval === "yearly" && plan.yearly.displayMonthlyEquivalent ? (
              <p className="mt-1 text-sm text-slate-500">
                {chrome.yearlyNote.replace("{equiv}", plan.yearly.displayMonthlyEquivalent)}
              </p>
            ) : null}
            {interval === "yearly" && plan.savingsPercent !== null ? (
              <p className="mt-1 inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
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
        <p className="mt-2 text-sm font-medium text-amber-800">
          {chrome.notApproved}
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-slate-500">{price.taxNote}</p>
      <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
        <li>{limitText(plan.limits.students, chrome.students, chrome.unlimited)} · {limitText(plan.limits.users, chrome.users, chrome.unlimited)} · {limitText(plan.limits.branches, chrome.branches, chrome.unlimited)}</li>
        {plan.moduleLabels.slice(0, 5).map((m) => (
          <li key={m}>· {m}</li>
        ))}
        {plan.moduleLabels.length > 5 ? <li>{chrome.moreModules.replace("{n}", String(plan.moduleLabels.length - 5))}</li> : null}
      </ul>
      <div className="mt-auto flex flex-col gap-2 pt-5">
        {!plan.customQuote ? (
          <a
            href={buyHref}
            aria-disabled={!price.approved}
            onClick={price.approved ? undefined : (e) => e.preventDefault()}
            className={
              price.approved
                ? "rounded-xl bg-amber-600 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                : "cursor-not-allowed rounded-xl bg-slate-100 px-5 py-2.5 text-center text-sm font-semibold text-slate-400"
            }
          >
            {chrome.buy}
          </a>
        ) : null}
        <a
          href={quoteHref}
          className="rounded-xl border border-slate-300 px-5 py-2.5 text-center text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
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
      <div className="mx-auto mt-8 flex max-w-xs items-center justify-center gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label={chrome.periodLabel}>
        {(["monthly", "yearly"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={interval === v}
            onClick={() => setInterval(v)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 ${
              interval === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
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
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => (
          <PlanCard key={p.key} plan={p} interval={interval} chrome={chrome} />
        ))}
      </ul>
    </div>
  );
}
