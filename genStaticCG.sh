#!/bin/bash

projRoot=$1
projName=$2

# if there is no QLDBs folder yet, create it
if [ ! -d "QLDBs" ]; then
	mkdir QLDBs
fi

# make the QL DB and upgrade it, if it doesnt already exist

if [ ! -d "QLDBs/$projName" ]; then
    # dependencies only used for linter or for typescript (i.e. not anything that will be traced through)
    # but which unnecessarily slow down the building of the QLDB
    declare -a exclude_from_QLDB=( "typescript*" "tslib/" "tsutils/" "prettier/" "pretty-format/" "eslint*" "tslint*" "type-check/" "@babel/" "@typescript*" )
    export LGTM_INDEX_FILTERS='include:/'
    for ex_dev in "${exclude_from_QLDB[@]}"; do
            rm -r $projRoot/node_modules/$ex_dev >/dev/null 2>&1 # pipe output to null to ignore errors if deps arent there
    done
    codeql database create --language=javascript --source-root $projRoot QLDBs/$projName
    codeql database upgrade QLDBs/$projName
fi


# run the query
codeql query run --search-path=$ANALYSIS_HOME --database QLDBs/$projName --output=tempOut.bqrs static_cg.ql
codeql bqrs decode --format=csv tempOut.bqrs > $projRoot/static_callgraph.csv
rm tempOut.bqrs

# reset the project in case some dependencies were removed for efficient DB building
./resetProject.sh $projRoot
