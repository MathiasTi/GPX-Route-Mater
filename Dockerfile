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

# Production-Stage (Nginx)
FROM nginx:alpine

# Standard-Nginx-Konfiguration entfernen und eigene hinzufügen
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/

# Gebaute Dateien aus der Build-Stage kopieren
COPY --from=builder /app/dist /usr/share/nginx/html

# Port freigeben
EXPOSE 80

# Nginx im Vordergrund starten
CMD ["nginx", "-g", "daemon off;"]
