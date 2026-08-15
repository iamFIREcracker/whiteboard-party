FROM node:22.23.2-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js ./
COPY public ./public

# ONCE mounts a named volume at /storage (STATE_FILE=/storage/state.json); a volume
# mounted over an existing image path inherits that path's ownership on first use, so
# the directory has to exist and belong to `node` for the app to write there.
RUN mkdir -p /storage && chown node:node /storage

USER node

# Production listens on 80 (Kamal Proxy targets the container directly).
EXPOSE 80

CMD ["node", "index.js"]
