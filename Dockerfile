# Use an official Node.js image based on Debian (Buster) as a base
FROM node:18-buster

# Install necessary packages for canvas including pixman
RUN apt-get update && \
    apt-get install -y \
      build-essential \
      libcairo2-dev \
      libpango1.0-dev \
      libpixman-1-dev && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of your application code
COPY . .

# Define the command to run your application
CMD ["npm", "start"] 