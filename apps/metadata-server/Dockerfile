FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install
COPY src ./src
RUN mkdir -p /data
ENV DATA_DIR=/data PORT=3000
EXPOSE 3000
CMD ["node", "--import", "tsx/esm", "src/index.ts"]
