#!/bin/bash

curDir=`pwd`
projDir=$1
cd $projDir
git reset --hard
rm -r node_modules
npm install
npm run build --if-present
cd $curDir
