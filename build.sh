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

mv /home/stubbifier/codeql-linux64.zip /home/codeql_home/ 
cd /home/codeql_home
unzip codeql-linux64.zip 
git clone https://github.com/github/codeql.git codeql-repo
# replace the built-in QL Modules definitions with our own, that will find modules in node_modules
mv /home/stubbifier/Modules.qll codeql-repo/javascript/ql/src/semmle/javascript/

echo "export PATH=/home/codeql_home/codeql:$PATH" >> /root/.bashrc
echo "alias python=python3" >> /root/.bashrc
echo "alias vi=vim" >> /root/.bashrc

npm install -g mocha
npm install -g jest
npm install -g nyc
npm install -g typescript


node --version
npm --version

cd /home/stubbifier
npm install
npm run build

