FROM node:22-slim

WORKDIR /app

# Install OpenSSL required by Prisma on slim images
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY prisma ./prisma

# Generate Prisma client BEFORE compiling TypeScript
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 10000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
