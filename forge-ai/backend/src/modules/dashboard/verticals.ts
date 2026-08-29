/**
 * Vertical dashboard templates.
 *
 * A "vertical" is a business function (Sales / Support / Ecommerce / etc.)
 * with its own vocabulary, expected KPIs, and preferred visuals. When a
 * client picks a vertical:
 *   - The LLM planner's system prompt gets a vertical-specific suffix, so it
 *     designs the dashboard the way that industry expects it to look
 *   - The default picker learns extra column-name synonyms for that vertical
 *     (e.g. "ticket" = count, "csat" = rate, "MRR" = revenue)
 *   - The dashboard gets a suggested default theme (dark or exec)
 *
 * This is the sellability layer — instead of a generic "upload CSV" flow,
 * the client picks "Sales Dashboard" and everything downstream is tuned for
 * that specific decision. Same infrastructure, dramatically better first
 * impression, no per-vertical code paths needed.
 */

export type VerticalKind =
  | 'sales' | 'support' | 'operations' | 'ecommerce'
  | 'executive' | 'itsm' | 'finance' | 'marketing'
  | 'general'

export interface Vertical {
  kind: VerticalKind
  name: string
  description: string
  /** Emoji shown in the picker UI. */
  icon: string
  /** Additional instructions appended to the LLM planner's system prompt.
   *  Should reinforce the KPIs and layout patterns typical of this vertical. */
  plannerHint: string
  /** Column-name synonyms — used by the default picker + metric inference to
   *  understand vertical-specific vocabulary. */
  columnSynonyms?: {
    revenue?: RegExp
    count?: RegExp
    rate?: RegExp
    category?: RegExp
  }
  /** Suggested theme — 'exec' for boardroom-oriented dashboards. */
  suggestedTheme?: 'dark' | 'exec'
}

export const VERTICALS: Vertical[] = [
  {
    kind: 'sales',
    name: 'Sales Dashboard',
    icon: '💰',
    description: 'Revenue, deals, pipeline, top products, regional performance. Executive-facing.',
    plannerHint: `This is a SALES dashboard. Prioritize:
- Hero KPIs (use kind:total for these — LIFETIME totals, not last-period):
    "Total Revenue"  → kind:total, valueColumn: the revenue column
    "Total Profit"   → kind:total, valueColumn: the profit column
    "Total Orders"   → kind:distinct_count, valueColumn: an order/transaction id
    "Unique Customers" → kind:distinct_count, valueColumn: customer_id
    "Avg Order Value" → kind:average, valueColumn: revenue
    "Profit Margin"  → kind:ratio, numeratorColumn: profit, denominatorColumn: revenue, ratioAsPercent: true
- Trend chart: Revenue + Profit + Cost over time (kind:multi_series, monthly buckets preferred)
- Top-N: top 10 products by revenue (kind:top_n)
- Category breakdown: revenue by category / region / channel (kind:donut or grouped_bar)
- OPTIONAL: kind:period_comparison for "Revenue this month vs last month" — ONLY if the client asks for period comparison. Do NOT use period_comparison for "Total Revenue" (that means the grand total).
- Detail table: transactions with columns [customer, product, revenue, profit, region]
Use bold, executive-friendly labels. Aim for 6-10 total metrics.`,
    suggestedTheme: 'exec',
  },
  {
    kind: 'support',
    name: 'Customer Support Dashboard',
    icon: '🎧',
    description: 'Tickets, response time, CSAT, agent workload, backlog trend, SLA compliance.',
    plannerHint: `This is a SUPPORT/HELP DESK dashboard. Prioritize:
- Hero KPIs: Total Tickets, Avg First Response Time, Avg Resolution Time, CSAT %, SLA Compliance %, Backlog Size
- Trend chart: ticket volume + backlog over time
- Category breakdown: tickets by category / priority / channel (donut)
- Top-N: agents by ticket count OR tickets by product/category
- Table: recent tickets with [id, customer, agent, priority, status, opened_at]
Look for columns like: ticket_id, agent, priority, status, category, response_time, resolution_time, csat, satisfaction.`,
    columnSynonyms: {
      count: /\b(ticket|case|incident|issue|inquir)/i,
      rate: /\b(csat|nps|satisfaction|sla|compliance|resolution.rate|first.contact)/i,
      category: /\b(priority|severity|status|agent|channel|team|queue)/i,
    },
    suggestedTheme: 'exec',
  },
  {
    kind: 'operations',
    name: 'Operations Dashboard',
    icon: '⚙️',
    description: 'Throughput, cycle time, inventory, quality, resource utilization.',
    plannerHint: `This is an OPERATIONS dashboard. Prioritize:
- Hero KPIs: Total Units Produced, Avg Cycle Time, Defect Rate %, On-Time Delivery %, Utilization %, Inventory Turnover
- Trend chart: throughput over time
- Category breakdown: output by line / shift / product family
- Top-N: bottleneck stations or delayed orders
- Table: work orders / batches with [id, item, quantity, status, started_at, cycle_time]
Look for columns like: cycle_time, defects, throughput, downtime, work_order, shift, machine, batch.`,
    columnSynonyms: {
      count: /\b(units|batch|work.order|throughput|output|produced)/i,
      rate: /\b(defect|scrap|yield|utilization|efficiency|otd|on.time)/i,
      category: /\b(shift|line|machine|station|product.family|plant|warehouse)/i,
    },
  },
  {
    kind: 'ecommerce',
    name: 'Ecommerce Dashboard',
    icon: '🛒',
    description: 'GMV, conversion rate, AOV, cart abandonment, top products, traffic sources.',
    plannerHint: `This is an ECOMMERCE dashboard. Prioritize:
- Hero KPIs: GMV / Revenue, Orders, Conversion Rate %, Avg Order Value, Cart Abandonment %, Return Rate %
- Trend chart: revenue + orders + sessions over time
- Category breakdown: revenue by category / traffic source / device
- Top-N: top 10 products by revenue, top SKUs by margin
- Table: orders with [order_id, customer, items, total, status]
Look for columns like: session, cart, checkout, source (organic/paid/email/social), device (mobile/desktop), sku, refund, return.`,
    columnSynonyms: {
      count: /\b(session|cart|checkout|visit|impression|click|conversion|add.to.cart)/i,
      rate: /\b(conversion|abandonment|refund|return|bounce|ctr|cvr)/i,
      category: /\b(source|channel|utm|device|category|brand|collection|sku)/i,
    },
    suggestedTheme: 'exec',
  },
  {
    kind: 'executive',
    name: 'Executive Summary',
    icon: '📈',
    description: 'Company-wide KPIs at a glance. Revenue, profit, growth, key ratios.',
    plannerHint: `This is an EXECUTIVE SUMMARY dashboard for the boardroom. Prioritize:
- 4-6 headline hero KPIs across the top: Revenue, Profit, Growth %, Customers/Users, Margin %, Key Ratio
- ONE big trend chart (revenue + profit multi_series over time)
- ONE category donut breakdown (revenue by segment / region / product line)
- A period_comparison KPI: "This period vs last"
- Keep it MINIMAL. Fewer, more polished metrics beat a dashboard full of noise.
- Suggest max 8 metrics total — this is for people who have 30 seconds.`,
    suggestedTheme: 'exec',
  },
  {
    kind: 'itsm',
    name: 'ITSM Dashboard',
    icon: '🖥️',
    description: 'IT service management: incidents, MTTR, uptime, change requests, asset health.',
    plannerHint: `This is an ITSM (IT Service Management) dashboard. Prioritize:
- Hero KPIs: Open Incidents, MTTR (Mean Time to Resolve) in hours, Change Success Rate %, Uptime %, SLA Breach %, Critical Alerts
- Trend chart: incident count + MTTR over time
- Category breakdown: incidents by service / severity / category
- Top-N: services with most incidents, teams with longest MTTR
- Table: recent incidents with [id, service, severity, opened, resolved, mttr]
Look for columns like: incident, change_request, mttr, sla, severity (P1/P2/P3), service_id, resolved_at, breach.`,
    columnSynonyms: {
      count: /\b(incident|change|request|alert|ticket|breach)/i,
      rate: /\b(uptime|availability|mttr|mtbf|sla|success.rate|breach.rate)/i,
      category: /\b(service|severity|priority|team|environment|region|category)/i,
    },
  },
  {
    kind: 'finance',
    name: 'Finance Dashboard',
    icon: '🏦',
    description: 'Revenue, expenses, cash flow, budget vs actual, key financial ratios.',
    plannerHint: `This is a FINANCE dashboard. Prioritize:
- Hero KPIs: Revenue, Expenses, Net Income, Cash Balance, Gross Margin %, Operating Margin %
- Trend chart: revenue + expenses over time (multi_series)
- Category breakdown: expenses by category / department (donut)
- Period comparison: "This month vs last", "YTD vs prior YTD"
- Table: transactions or budget lines with [account, category, budget, actual, variance]
Look for columns like: revenue, expense, cost, budget, actual, variance, account, department, cash, equity, liability.`,
    columnSynonyms: {
      revenue: /\b(revenue|sales|income|receipts)/i,
      rate: /\b(margin|variance|budget.variance|growth|yield)/i,
      category: /\b(account|department|cost.center|gl|category)/i,
    },
    suggestedTheme: 'exec',
  },
  {
    kind: 'marketing',
    name: 'Marketing Dashboard',
    icon: '📣',
    description: 'Campaigns, CAC, ROAS, funnel, channel performance, leads generated.',
    plannerHint: `This is a MARKETING dashboard. Prioritize:
- Hero KPIs: Marketing Spend, Leads Generated, CAC (Customer Acquisition Cost), ROAS, Conversion Rate %, Pipeline Value
- Trend chart: spend + leads + revenue attributed over time (multi_series)
- Category breakdown: leads or revenue by channel / campaign (donut)
- Top-N: top campaigns by ROAS, top sources by conversion rate
- Table: campaigns with [name, channel, spend, leads, conversions, cac, roas]
Look for columns like: campaign, channel, spend, impressions, clicks, leads, conversions, cac, ltv, roas, source, medium.`,
    columnSynonyms: {
      count: /\b(lead|click|impression|conversion|signup|install|visit)/i,
      rate: /\b(cac|ltv|roas|cpa|cpc|cpm|ctr|conversion.rate)/i,
      category: /\b(channel|campaign|source|medium|utm)/i,
    },
  },
  {
    kind: 'general',
    name: 'General Dashboard',
    icon: '📊',
    description: 'AI figures out the best layout from your data + requirements prompt.',
    plannerHint: '',
  },
]

export function getVertical(kind: string | undefined): Vertical {
  return VERTICALS.find((v) => v.kind === kind) ?? VERTICALS[VERTICALS.length - 1] // 'general'
}
