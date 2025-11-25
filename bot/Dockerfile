# bot/Dockerfile
FROM node:20-alpine

WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production
CMD ["node", "bot.js"]
