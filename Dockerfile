# Headless Goal Horn for a home server or Raspberry Pi. Plays through the host's
# sound card and serves the control and speaker pages on port 8787.
#
#   docker run -d --name goal-horn --network host --device /dev/snd \
#     -v goal-horn-data:/data ghcr.io/colbykordas/goal-horn
#
# --network host lets phones on your Wi-Fi reach it and shows the right address.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends mpg123 alsa-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV GOALHORN_DATA=/data
VOLUME /data
EXPOSE 8787
CMD ["node", "src/server/cli.js"]
