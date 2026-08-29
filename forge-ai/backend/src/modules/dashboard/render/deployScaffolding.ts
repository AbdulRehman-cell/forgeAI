// Deploy scaffolding — mirrors what the website builder emits so the exact
// same lib/deployers path can host a dashboard. Nothing dashboard-specific;
// these files describe a plain static site.

/** render.yaml: static site definition Render.com understands. */
export function renderYaml(dashboardName: string): string {
  return `services:
  - type: web
    name: ${sanitize(dashboardName)}
    runtime: static
    buildCommand: ""
    staticPublishPath: ./
    envVars: []
`
}

/** vercel.json: static routing for the built output. */
export function vercelJson(): string {
  return JSON.stringify({
    // Everything is prebuilt; no framework, no build step.
    outputDirectory: '.',
    cleanUrls: true,
    rewrites: [{ source: '/(.*)', destination: '/index.html' }],
  }, null, 2)
}

/** Dockerfile: nginx serving the static bundle. Matches the website builder's
 *  format so operators can use the same base image cache. */
export function dockerfile(): string {
  return `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`
}

/** nginx config that serves index.html for unknown paths (SPA-safe, though
 *  we're not an SPA — this keeps deep links working if we add any later). */
export function nginxConf(): string {
  return `server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
  location ~* \\.(css|js|json|png|jpg|jpeg|gif|svg|webp|ico)$ {
    expires 1h;
    add_header Cache-Control "public, no-transform";
  }
}
`
}

function sanitize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'dashboard'
}
