# Backend Dockerfile for EnhanceUnits
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy backend source code and prompt file
COPY backend ./backend
COPY shared ./shared
COPY prompt-force.md ./prompt-force.md

# Expose the backend port
EXPOSE 3000

# Create uploads directory
RUN mkdir -p uploads

# Start the development server with hot reload
CMD ["npm", "run", "dev:backend"]
