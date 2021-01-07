#!/bin/bash

curDir=`pwd`
projDir=$1
cd $projDir
git reset --hard
if [ -d node_modules ]; then
	rm -r node_modules
fi
npm install
npm run build --if-present
cd $curDir
