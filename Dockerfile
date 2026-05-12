# Build-Stage: Wir nutzen 'slim' (Debian/glibc) statt 'alpine' (musl). 
# Das behebt den bekannten Rollup-Architektur-Bug bei ARM64 (Apple Silicon).
FROM node:20-slim AS builder

WORKDIR /app

# Abhängigkeiten kopieren und installieren
# WICHTIG: Wir kopieren absichtlich NUR die package.json und NICHT die package-lock.json!
# Das zwingt npm dazu, die passenden Linux-Abhängigkeiten frisch aufzulösen.
COPY package.json ./
RUN npm cache clean --force && npm install

# Quellcode kopieren und Anwendung bauen
COPY . .
RUN npm run build

# Production-Stage (Nginx mit Certbot)
FROM nginx:alpine

# Certbot, Nginx-Plugin für Certbot und bash installieren
RUN apk add --no-cache certbot certbot-nginx bash

# Alte Config entfernen und durch unsere austauschen
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/nginx.conf

# Start-Skript für Let's Encrypt Logik kopieren
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Gebaute Dateien aus der Build-Stage kopieren
COPY --from=builder /app/dist /usr/share/nginx/html

# Port 80 (HTTP) und 443 (HTTPS) nach außen freigeben
EXPOSE 80 443

# Entrypoint führt Skript aus
CMD ["/entrypoint.sh"]
