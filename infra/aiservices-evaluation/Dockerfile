FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
# The source repository has a development-only prepare hook.  This image contains
# production dependencies only; lifecycle scripts are deliberately not executed
# during installation so the image build does not run repository hooks.
# The service imports `acorn`, which is currently recorded as a dev dependency
# in the application lockfile.  Include the locked development tree solely so
# this evaluation can exercise the real server; this packaging defect is
# recorded as an evaluation finding.  The lockfile also needs npm's legacy peer
# resolver for the known Stagehand/Zod conflict.
RUN npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund

COPY . ./
RUN mkdir -p uploads && chown -R node:node /app

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "server.js"]
