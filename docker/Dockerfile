FROM node:20.18

RUN npm install -g bun

WORKDIR /app

# Install dependencies as a separate, cacheable layer. Only re-runs when the
# manifest or lockfile changes, so source edits don't trigger a reinstall.
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
