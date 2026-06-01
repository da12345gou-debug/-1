FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY LANDING_PAGE_TYPE_RULES.md ./
COPY public ./public

RUN mkdir -p outputs uploads

ENV HOST=0.0.0.0
ENV PORT=4174

EXPOSE 4174

CMD ["node", "server.js"]
