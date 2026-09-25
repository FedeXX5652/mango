# PWA de Mango: se compila con node y se sirve estatica con nginx.
#
# OJO: `VITE_API_URL` y `VITE_POWERSYNC_URL` se **hornean en el build** —Vite las
# inyecta en el bundle— y son la direccion que ve el NAVEGADOR (tu telefono),
# no la DNS interna de docker. Por eso son build-args, no variables de runtime.
# Si cambia el host desde el que se entra (la IP de Tailscale, el nombre del
# homelab), hay que **recompilar la imagen**. Es la limitacion clasica de una
# SPA; un config.js en runtime la sacaria, y queda anotado como mejora futura.

FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_API_URL=http://localhost:8000
ARG VITE_POWERSYNC_URL=http://localhost:8080
ENV VITE_API_URL=$VITE_API_URL \
    VITE_POWERSYNC_URL=$VITE_POWERSYNC_URL

# Dependencias primero, para cachear cuando solo cambia el codigo.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Servido ---
FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
