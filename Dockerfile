# Build stage: install dependencies, run the tests and build dist/.
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm test && npm run build

# Runtime stage: only the static server and the built files.
FROM node:24-alpine
WORKDIR /app
RUN npm install -g http-server@14 && \
    apk add --no-cache openssl && \
    openssl req -newkey rsa:2048 -new -nodes -x509 -days 3650 \
      -keyout key.pem -out cert.pem -subj "/CN=localhost"
COPY --from=build /app/dist ./dist
COPY manifest.xml docker-entrypoint.sh ./

ENV USE_HTTPS=false
EXPOSE 3000
CMD ["sh", "/app/docker-entrypoint.sh"]
