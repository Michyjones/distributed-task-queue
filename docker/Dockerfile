FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY src ./src
COPY examples ./examples

CMD ["node", "examples/basic-usage.js"]