FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY VERSION_NOTES.md ./
COPY public ./public
COPY tools ./tools

RUN mkdir -p logs \
  tools/landing/outputs tools/landing/uploads \
  tools/aggregate/outputs \
  tools/copy/outputs

ENV HOST=0.0.0.0
ENV PORT=4174

EXPOSE 4174

CMD ["node", "server.js"]
