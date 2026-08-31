# Static build served by nginx on Cloud Run. Two stages so the image ships the
# compiled assets, not node_modules.
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# The API origin is compiled in, so it is a build argument, not a runtime env var.
ARG VITE_API_BASE
ARG VITE_GOOGLE_MAPS_API_KEY
ENV VITE_API_BASE=$VITE_API_BASE VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Single-page app: every route resolves to index.html, and Cloud Run picks the port.
RUN printf 'server {\n listen ${PORT};\n root /usr/share/nginx/html;\n location / {\n  try_files $uri $uri/ /index.html;\n }\n}\n' > /etc/nginx/templates/default.conf.template
ENV PORT=8080
CMD ["nginx", "-g", "daemon off;"]
