# Build-Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Abhängigkeiten kopieren und installieren
COPY package*.json ./
RUN npm install

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
