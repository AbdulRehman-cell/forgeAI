import passport from 'passport'
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt'
import { Strategy as GitHubStrategy } from 'passport-github2'
import { User } from '../modules/users/user.model'

export function configurePassport() {
  // JWT
  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: process.env.JWT_SECRET ?? 'dev_secret',
      },
      async (payload, done) => {
        try {
          const user = await User.findById(payload.sub).select('-password')
          if (!user) return done(null, false)
          return done(null, user)
        } catch (err) {
          return done(err, false)
        }
      },
    ),
  )

  // GitHub OAuth
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID ?? '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
        callbackURL: process.env.GITHUB_CALLBACK_URL ?? 'http://localhost:4000/api/auth/github/callback',
        scope: ['user:email', 'repo'],
      },
      async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
        try {
          const email = profile.emails?.[0]?.value ?? `${profile.username}@github.local`

          let user = await User.findOne({ githubId: profile.id })
          if (!user) {
            // Check if an account already exists under this email (e.g. password signup)
            user = await User.findOne({ email })
            if (user) {
              // Link the existing account to GitHub
              user.githubId = profile.id
              user.githubAccessToken = _accessToken
              user.githubConnected = true
              if (!user.avatar) user.avatar = profile.photos?.[0]?.value
              await user.save()
            } else {
              user = await User.create({
                githubId: profile.id,
                name: profile.displayName ?? profile.username,
                email,
                avatar: profile.photos?.[0]?.value,
                githubAccessToken: _accessToken,
                githubConnected: true,
              })
            }
          } else {
            user.githubAccessToken = _accessToken
            user.githubConnected = true
            await user.save()
          }

          // If this user accepted a team invite before they had an account,
          // wire up teamOwnerId/teamRole now that their account exists.
          if (!user.teamOwnerId) {
            const owner = await User.findOne({
              teamMembers: { $elemMatch: { email, accepted: true, userId: { $exists: false } } },
            }).select('+teamMembers.inviteToken')
            if (owner) {
              const member = (owner.teamMembers ?? []).find(
                (m: any) => m.email === email && m.accepted && !m.userId,
              )
              if (member) {
                member.userId = user._id
                await owner.save()
                user.teamOwnerId = owner._id as any
                user.teamRole = member.role
                await user.save()
              }
            }
          }

          return done(null, user)
        } catch (err) {
          // Use done(null, false) so passport follows failureRedirect instead of crashing with 500
          console.error('[passport] GitHub strategy error:', (err as any)?.message ?? err)
          return done(null, false)
        }
      },
    ),
  )
}
