FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c

WORKDIR /opt/orcheval-lab
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
# This manifest, lockfile, npm cache and node_modules exist only in the image.
RUN npm install --save-exact --no-audit --no-fund \
      @temporalio/client@1.24.0 \
      @temporalio/worker@1.24.0 \
      @temporalio/workflow@1.24.0 \
      inngest@4.21.1 \
    && npm cache clean --force

CMD ["node", "--version"]
