import { Schema, model, Document, Types } from 'mongoose'
import { randomUUID } from 'crypto'

export interface IRepository extends Document {
  userId: Types.ObjectId
  /** Missing for repos created from a non-GitHub source (data uploads, generated dashboards). */
  githubId?: number
  name: string
  fullName: string
  description?: string
  language?: string
  private: boolean
  defaultBranch: string
  /** Missing for non-GitHub sources — dashboards, data-upload repos don't have a git remote yet. */
  cloneUrl?: string
  localPath?: string
  /** 'github' = cloned from GitHub; 'local' = an existing folder on this machine; 'data' = a dashboard generated from an uploaded data source. */
  source: 'github' | 'local' | 'data'
  status: 'idle' | 'cloning' | 'indexing' | 'ready' | 'error'
  errorMessage?: string
  indexed: boolean
  fileCount?: number
  /** Per-platform deploy state (service/project ids) so re-runs redeploy instead of duplicating */
  deployState?: Record<string, any>
  /** Env vars the builder collected (e.g. MONGODB_URI) — applied on deploy. Secret: select:false */
  builderEnv?: Record<string, string>
  // ── Dashboard-only fields (only set when source === 'data') ──
  /** How the dashboard's underlying data is fetched. Persisted so the scheduled
   *  refresh (M7) can re-run the pipeline without the user re-uploading. */
  dashboardSource?: {
    kind: 'upload' | 'google_sheet' | 'stripe'
    /** Config for the adapter — shape depends on kind. Mixed on purpose. */
    config: Record<string, any>
    /** cron expression ('0 6 * * *' = 6am daily). null = manual refresh only. */
    refreshCron?: string | null
    /** Last time the scheduler kicked off a refresh — used for skew avoidance. */
    lastRefreshAt?: Date
    /** Structural stats of the most recent successful build, for the UI to show. */
    lastBuild?: { rowsIn: number; rowsOut: number; warnings: number; errors: number; at: Date }
    /** Free-text description from the client of what the dashboard should show
     *  ("I sell shoes online, I need to see monthly revenue, top products,
     *  return rate, and orders by country"). Fed to the LLM planner so the
     *  metric selection matches intent instead of blindly defaulting. */
    userPrompt?: string
    /** Visual theme. 'dark' (default) = current dark pastel; 'exec' = light
     *  blue-and-white executive style. */
    theme?: 'dark' | 'exec'
    /** Vertical template: sales/support/operations/ecommerce/executive/itsm/
     *  finance/marketing/general. Biases the LLM planner + auto-picker toward
     *  the KPIs and vocabulary typical of that business function. */
    vertical?: string
  }
  /** Public share token — set when the user generates a shareable client report link */
  shareToken?: string
  /** Client approval workflow */
  approvalToken?: string
  approvalStatus?: 'pending' | 'approved' | 'rejected'
  approvalNote?: string
  approvedAt?: Date
  /** When true, the coming-soon HTML is injected into the deployed repo */
  maintenanceMode?: boolean
  /** Analytics provider auto-injected at build time */
  analyticsProvider?: 'ga' | 'plausible' | null
  analyticsId?: string
  /** Monthly maintenance plan (re-runs enhance on a schedule) */
  maintenancePlan?: {
    active: boolean
    nextRunAt?: Date
    lastRunAt?: Date
  }
  /** Granular team permissions — null/empty = all team members can access */
  allowedMemberIds?: Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

const repositorySchema = new Schema<IRepository>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Optional: dashboards and locally-generated repos have no GitHub id/clone URL.
    githubId: { type: Number, required: false },
    name: { type: String, required: true },
    fullName: { type: String, required: true },
    description: String,
    language: String,
    private: { type: Boolean, default: false },
    defaultBranch: { type: String, default: 'main' },
    cloneUrl: { type: String, required: false },
    localPath: String,
    source: { type: String, enum: ['github', 'local', 'data'], default: 'github' },
    status: { type: String, enum: ['idle', 'cloning', 'indexing', 'ready', 'error'], default: 'idle' },
    errorMessage: String,
    indexed: { type: Boolean, default: false },
    fileCount: Number,
    deployState: { type: Schema.Types.Mixed, default: {} },
    builderEnv: { type: Schema.Types.Mixed, select: false },
    shareToken: { type: String, index: { sparse: true } },
    approvalToken: { type: String, index: { sparse: true } },
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'] },
    approvalNote: String,
    approvedAt: Date,
    maintenanceMode: { type: Boolean, default: false },
    allowedMemberIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    analyticsProvider: { type: String, enum: ['ga', 'plausible', null] },
    analyticsId: String,
    maintenancePlan: {
      active: { type: Boolean, default: false },
      nextRunAt: Date,
      lastRunAt: Date,
    },
    dashboardSource: {
      kind: { type: String, enum: ['upload', 'google_sheet', 'stripe'] },
      config: { type: Schema.Types.Mixed, default: {} },
      refreshCron: { type: String, default: null },
      lastRefreshAt: Date,
      lastBuild: {
        rowsIn: Number, rowsOut: Number, warnings: Number, errors: Number, at: Date,
      },
      userPrompt: String,
      theme: { type: String, enum: ['dark', 'exec'], default: 'dark' },
      vertical: { type: String, default: 'general' },
    },
  },
  { timestamps: true },
)

repositorySchema.index({ userId: 1 })
// Partial compound unique — only enforced on documents where githubId is
// actually a number. Sparse index would treat null as "missing" but Mongo
// only counts BSON-missing (not stored null) as sparse-missing, which is
// exactly why the old sparse form still collided on githubId: null when
// dashboards saved that field as null. A partial index with an explicit
// $exists+$type predicate matches only real GitHub repos.
repositorySchema.index(
  { userId: 1, githubId: 1 },
  { unique: true, partialFilterExpression: { githubId: { $type: 'number' } } },
)
// Dashboards are named per-user; enforce name uniqueness within a user's own
// data-source repos so /repos/{userId}/{name} paths don't clash.
repositorySchema.index({ userId: 1, name: 1, source: 1 }, { unique: true })

repositorySchema.pre('save', function (next) {
  if (!this.shareToken) this.shareToken = randomUUID()
  next()
})

export const Repository = model<IRepository>('Repository', repositorySchema)
