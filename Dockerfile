FROM node:13-alpine3.10
WORKDIR /usr/src/app
COPY package.json ./

ARG BBZ_MODE
ENV MODE=$BBZ_MODE
ENV NODE_ENV='production'

RUN npm install --production

COPY ./views ./views
COPY ./app.js ./
COPY ./static/images/$MODE ./static/images/$MODE

CMD [ "node", "app.js" ]