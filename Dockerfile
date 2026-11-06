# Build:  docker build --build-arg BASE_PATH=/studio -t beacon-studio .
# Git Bash: put MSYS_NO_PATHCONV=1 before docker build, or Git Bash turns /studio into a Windows path.
# Run:    docker run -p 8080:80 beacon-studio

FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .

# Vite bakes these values into the bundle, so a change needs a new image.
ARG BASE_PATH=""
ARG STUDIO_TELEMETRY=off
ARG STUDIO_BRAND=""
# The build context has no .git folder. CI can pass the commit for the About page.
ARG GIT_COMMIT=""
ARG GIT_BRANCH=""

ENV BASE_PATH=${BASE_PATH} \
    STUDIO_TELEMETRY=${STUDIO_TELEMETRY} \
    STUDIO_BRAND=${STUDIO_BRAND} \
    GIT_COMMIT=${GIT_COMMIT} \
    GIT_BRANCH=${GIT_BRANCH}

RUN npm run build


FROM nginx:1.28-alpine

ARG BASE_PATH=""

COPY docker/nginx.conf.template /tmp/nginx.conf.template
RUN envsubst '${BASE_PATH}' < /tmp/nginx.conf.template > /etc/nginx/conf.d/default.conf \
    && rm /tmp/nginx.conf.template

COPY --from=builder /app/build /usr/share/nginx/html${BASE_PATH}

EXPOSE 80
