// backend/src/lib/plans.ts
export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    limits: { fixes: 5, chats: 50, reviews: 3, repos: 2, deploys: 3, builds: 1 },
  },
  pro: {
    name: 'Pro',
    price: 19,
    limits: { fixes: 100, chats: 2000, reviews: 100, repos: 20, deploys: 100, builds: 5 },
  },
  team: {
    name: 'Team',
    price: 49,
    limits: { fixes: Infinity, chats: Infinity, reviews: Infinity, repos: Infinity, deploys: Infinity, builds: Infinity },
  },
} as const

// Price in cents charged per site build once the monthly free allowance is exhausted.
// Override with SITE_BUILD_PRICE_CENTS env var.
export const SITE_BUILD_PRICE_CENTS = parseInt(process.env.SITE_BUILD_PRICE_CENTS ?? '1999', 10)

export type UsageKind = 'fixes' | 'chats' | 'reviews' | 'deploys' | 'builds'
