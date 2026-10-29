FROM node:24-alpine
ENV NODE_ENV=production TZ=Europe/Kyiv
WORKDIR /app
COPY . .
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
