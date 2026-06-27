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
          let user = await User.findOne({ githubId: profile.id })
          if (!user) {
            user = await User.create({
              githubId: profile.id,
              name: profile.displayName ?? profile.username,
              email: profile.emails?.[0]?.value ?? `${profile.username}@github.local`,
              avatar: profile.photos?.[0]?.value,
              githubAccessToken: _accessToken,
              githubConnected: true,
            })
          } else {
            user.githubAccessToken = _accessToken
            user.githubConnected = true
            await user.save()
          }
          return done(null, user)
        } catch (err) {
          return done(err, null)
        }
      },
    ),
  )
}
