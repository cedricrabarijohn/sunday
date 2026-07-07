FROM node:20.18

# Pin Bun to the version that maintains bun.lockb. An unpinned `bun` floats to
# the latest release, whose `--frozen-lockfile` install rejects this lockfile's
# integrity hashes (they're written in an older format). Keep this in lockstep
# with the CI pin and the local toolchain.
RUN npm install -g bun@1.1.43

WORKDIR /app

# Install dependencies as a separate, cacheable layer. Only re-runs when the
# manifest or lockfile changes, so source edits don't trigger a reinstall.
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
