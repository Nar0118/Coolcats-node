# Copyright © 2019 Sunrise Labs, Inc.
# All rights reserved.

# Basing image on node:17.5.0 - latest as of 2/22/22
FROM --platform=linux/amd64 node:17.5.0-stretch as build-stage
ARG NPM_TOKEN

WORKDIR /app

# Install dependencies (creating node_modules directory)
COPY ./package*.json /app/
COPY ./.npmrc /app/
RUN npm install

# Copy our application into image
COPY ./tslint.json /app/
COPY ./src/ /app/src/
COPY ./tsconfig.json /app/src/

# Build the typescript into javascript
RUN ./node_modules/typescript/bin/tsc -p ./src/

FROM --platform=linux/amd64 node:17.5.0-stretch-slim
ARG NPM_TOKEN

COPY --from=build-stage /app/src/dist /app/dist
COPY --from=build-stage /app/.npmrc /app/.npmrc

WORKDIR /app

# Install dependencies (creating node_modules directory)
COPY ./package*.json /app/
RUN npm install --production


COPY ./start.sh /app/
RUN chmod +x /app/start.sh
# Start the node server redirecting stdin and stderr to log file
ENTRYPOINT ["/bin/bash", "-c", "/app/start.sh"]

EXPOSE 80
EXPOSE 443
EXPOSE 3306
