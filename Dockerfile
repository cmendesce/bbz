FROM node:13-alpine3.10
WORKDIR /usr/src/app
COPY package.json ./

RUN npm install --production

COPY . .

CMD [ "node", "app.js" ]