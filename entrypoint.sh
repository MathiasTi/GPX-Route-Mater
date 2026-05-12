#!/bin/bash
set -e

# Ersetze den Platzhalter in der Nginx-Konfiguration
if [ -n "$DOMAIN" ]; then
    echo "Setze Nginx server_name auf $DOMAIN..."
    sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/conf.d/nginx.conf
else
    echo "Keine DOMAIN gesetzt. Verwende '_' (catch-all) als server_name."
    sed -i "s/DOMAIN_PLACEHOLDER/_/g" /etc/nginx/conf.d/nginx.conf
fi

# Wenn keine Domain gesetzt ist, starte nur HTTP auf Port 80
if [ -z "$DOMAIN" ]; then
    echo "--------------------------------------------------------"
    echo " Starte reinen HTTP Webserver auf Port 80 "
    echo " (Für SSL/HTTPS setze die Umgebungsvariable -e DOMAIN=...)"
    echo "--------------------------------------------------------"
    exec nginx -g "daemon off;"
else
    echo "--------------------------------------------------------"
    echo " Let's Encrypt / HTTPS Modus aktiviert für: $DOMAIN "
    echo "--------------------------------------------------------"
    
    EMAIL=${CERT_EMAIL:-"admin@$DOMAIN"}

    # Nginx kurz im Hintergrund starten für den "HTTP-01" Check von Let's Encrypt
    nginx

    # Warte kurz, bis Nginx vollständig läuft
    sleep 2

    # Prüfen, ob für diese Domain schon ein Zertifikat liegt 
    # (z.B. durch Volumes aus einem vorherigen Start)
    if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        echo "Beziehe initiales Zertifikat von Let's Encrypt..."
        certbot --nginx -n --agree-tos -m "$EMAIL" -d "$DOMAIN"
    else
        echo "Zertifikat existiert bereits, überspringe Neuanforderung."
    fi

    # Hintergrund-Nginx wieder stoppen, weil exec am Ende den Hauptprozess übernimmt
    nginx -s stop
    sleep 2

    # Cron-Dämon für automatische Zertifikatsverlängerung (Renewal) im Hintergrund starten
    # Der Befehl prüft täglich um 03:00 Uhr und lädt Nginx neu, falls erneuert wurde.
    echo "0 3 * * * /usr/bin/certbot renew --quiet --post-hook 'nginx -s reload'" | crontab -
    crond -b

    echo "==> Starte Nginx Server (HTTP -> HTTPS)..."
    exec nginx -g "daemon off;"
fi
