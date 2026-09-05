FROM node:20-alpine AS builder
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json tsconfig.json ./
RUN npm install --include=dev
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/repos
EXPOSE 4000
CMD ["node", "dist/index.js"]
