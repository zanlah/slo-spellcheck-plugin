FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci && npm install -g http-server

COPY . .
RUN npm run build

# Generate self-signed cert for https (http-server -S expects cert.pem and key.pem in cwd)
RUN apk add --no-cache openssl && \
    openssl req -newkey rsa:2048 -new -nodes -x509 -days 3650 \
    -keyout key.pem -out cert.pem -subj "/CN=localhost"

EXPOSE 3000

# Serve dist/ over HTTPS (required by Office add-ins) on 0.0.0.0 for Docker port mapping
CMD ["http-server", "dist", "-p", "3000", "-S", "-C", "cert.pem", "-K", "key.pem", "-a", "0.0.0.0", "--cors"]
