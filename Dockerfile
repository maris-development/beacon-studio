# syntax=docker/dockerfile:1

# The @beacon/client SDK lives in the beacon repository, outside this build context.
# Override with a local copy: --build-context beacon-client=../beacon/beacon-clients/beacon-ts
ARG BEACON_REF=main

FROM node:22-slim AS beacon-client-build
ARG BEACON_REF
WORKDIR /sdk
ADD https://github.com/maris-development/beacon.git#${BEACON_REF}:beacon-clients/beacon-ts .
RUN npm ci && npm run build

# The SDK sits at the root, so a local --build-context has the same layout.
FROM scratch AS beacon-client
COPY --from=beacon-client-build /sdk /

FROM node:22-slim AS build
# package-lock.json links the SDK at ../beacon/beacon-clients/beacon-ts.
COPY --from=beacon-client / /src/beacon/beacon-clients/beacon-ts
WORKDIR /src/beacon-studio
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .

ARG BASE_PATH=""
# The build has no .git folder, so the sidebar version and telemetry read the commit from these.
ARG GIT_COMMIT=""
ARG GIT_BRANCH=""
ARG GIT_REPO_URL=""
RUN BASE_PATH="$BASE_PATH" GIT_COMMIT="$GIT_COMMIT" GIT_BRANCH="$GIT_BRANCH" GIT_REPO_URL="$GIT_REPO_URL" \
    npm run build

FROM nginx:stable-alpine
ARG BASE_PATH=""
# The nginx image runs envsubst on /etc/nginx/templates at start.
ENV BASE_PATH=${BASE_PATH}
RUN rm -rf /usr/share/nginx/html/*
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/beacon-studio/build /usr/share/nginx/html${BASE_PATH}
EXPOSE 80
