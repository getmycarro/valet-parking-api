FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build && npx prisma generate

EXPOSE 10000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
