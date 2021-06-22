#!/bin/bash

# finds the absolute path from relative path
# called realpath bc thats the utility on linux
# https://stackoverflow.com/questions/3572030/bash-script-absolute-path-with-os-x
realpathMACHACK() {
    [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"
}

transformType=$2
projDir=$1
guardedMode="true"

if [ "$#" == 3 ]; then
	guardedMode=$3
fi

if [[ "$transformType" == "dynamic" ]]; then
	node stubbifyRunner.js --transform $projDir --uncovered `realpathMACHACK $projDir/coverage/coverage-final.json` --dependencies $projDir/dep_list.txt --guarded_exec_mode $guardedMode
elif [[ "$transformType" == "static" ]]; then 
	node stubbifyRunner.js --transform $projDir --callgraph `realpathMACHACK $projDir/static_callgraph.csv` --dependencies $projDir/dep_list.txt --guarded_exec_mode $guardedMode
elif [[ "$transformType" == "hybrid" ]]; then
	node stubbifyRunner.js --transform $projDir --callgraph `realpathMACHACK $projDir/static_callgraph.csv` --uncovered `realpathMACHACK $projDir/coverage/coverage-final.json` --dependencies $projDir/dep_list.txt --guarded_exec_mode $guardedMode
else
	echo "Error: transform_type must be either \"dynamic\" or \"static\""
	echo "Usage: ./transform.sh proj_dir ( \"dynamic\" | \"static\" )"
fi
