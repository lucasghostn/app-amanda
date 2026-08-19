# Optional Dockerfile for building the API image
FROM node:18-alpine
WORKDIR /usr/src/app
COPY server/package.json server/package-lock.json* ./
RUN npm install --production
COPY server/ .
EXPOSE 4000
CMD ["node","index.js"]
