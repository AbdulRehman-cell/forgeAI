// backend/src/lib/plans.ts
export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    limits: { fixes: 5, chats: 50, reviews: 3, repos: 2, deploys: 3 },
  },
  pro: {
    name: 'Pro',
    price: 19,
    limits: { fixes: 100, chats: 2000, reviews: 100, repos: 20, deploys: 100 },
  },
  team: {
    name: 'Team',
    price: 49,
    limits: { fixes: Infinity, chats: Infinity, reviews: Infinity, repos: Infinity, deploys: Infinity },
  },
} as const

export type UsageKind = 'fixes' | 'chats' | 'reviews' | 'deploys'
