 
FROM ubuntu:latest
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
	&& apt-get -y install --no-install-recommends python3 git unzip vim yarn curl gnupg nodejs npm xz-utils

RUN mkdir -p /home/stubbifier/Playground

COPY . /home/stubbifier

WORKDIR /home/stubbifier

RUN git config --global http.sslVerify "false"
RUN npm config set strict-ssl false
RUN ./build.sh
