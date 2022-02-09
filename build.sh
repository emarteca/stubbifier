#!/bin/bash

# we need a version of node that supports the ESM module system
# ubuntu ships with an old version
# curl -sL https://deb.nodesource.com/setup_16.x | bash -
# apt-get update
# apt-get install -y nodejs


rm build.sh
rm Dockerfile
rm runDocker.sh
rm -r local_mount

mkdir -p /home/codeql_home

cd /home/codeql_home
curl -L -o codeql-linux64.zip https://github.com/github/codeql-cli-binaries/releases/download/v2.3.4/codeql-linux64.zip
unzip codeql-linux64.zip 
# clone stable version
git clone https://github.com/github/codeql.git --branch v1.26.0 codeql-repo

# replace the built-in QL Modules definitions with our own, that will find modules in node_modules
mv /home/stubbifier/Modules.qll codeql-repo/javascript/ql/src/semmle/javascript/

echo "export PATH=/home/codeql_home/codeql:$PATH" >> /root/.bashrc
echo "alias python=python3" >> /root/.bashrc
echo "alias vi=vim" >> /root/.bashrc

npm install -g mocha
npm install -g jest
npm install -g nyc
npm install -g typescript
npm install -g rollup 

node --version
npm --version

cd /home/stubbifier
npm install
npm run build

