# Build:  docker build --build-arg BASE_PATH=/studio -t beacon-studio .
# Git Bash: put MSYS_NO_PATHCONV=1 before docker build, or Git Bash turns /studio into a Windows path.
# Run:    docker run -p 8080:80 beacon-studio

FROM node:22-alpine AS builder
WORKDIR /app

# Vite reads the commit and branch from .git. A Windows checkout has CRLF files, and autocrlf keeps them clean.
RUN apk add --no-cache git \
    && git config --global core.autocrlf input

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .

# Vite bakes these values into the bundle, so a change needs a new image.
ARG BASE_PATH=""
ARG STUDIO_TELEMETRY=off
ARG STUDIO_BRAND=""
# These override the values from .git, for a build context without .git.
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
