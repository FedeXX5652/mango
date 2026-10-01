# PWA de Mango: se compila con node y se sirve estatica con nginx, que ademas
# es la puerta de entrada unica (proxy a la API y a PowerSync, ver nginx.conf).
#
# Por defecto la imagen habla con su MISMO origen (`/` y `/powersync`): no
# depende del host desde el que se entra, asi que la misma imagen publicada
# sirve para cualquier instalacion (ver 0020). Los build-args solo hacen falta
# para una build que apunte a servicios en otro host/puerto (casos de desarrollo).

FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_API_URL=/
ARG VITE_POWERSYNC_URL=/powersync
ENV VITE_API_URL=$VITE_API_URL \
    VITE_POWERSYNC_URL=$VITE_POWERSYNC_URL

# Dependencias primero, para cachear cuando solo cambia el codigo.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Commit del que sale la compilacion, para la version que se ve en Ajustes
# (0025). La imagen no tiene .git: lo pasa el compose o release.sh. Va despues
# de `npm ci` para no invalidar la cache de dependencias en cada commit.
ARG APP_COMMIT=
ENV APP_COMMIT=$APP_COMMIT
RUN npm run build

# --- Servido ---
FROM nginx:alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/FedeXX5652/mango" \
      org.opencontainers.image.title="mango-frontend" \
      org.opencontainers.image.description="Mango: PWA y puerta de entrada (nginx)"
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
