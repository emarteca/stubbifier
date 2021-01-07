#!/bin/bash

projRoot=$1
projName=$2

# if there is no QLDBs folder yet, create it
if [ ! -d "QLDBs" ]; then
	mkdir QLDBs
fi

# make the QL DB and upgrade it, if it doesnt already exist

if [ ! -d "QLDBs/$projName" ]; then
	export LGTM_INDEX_FILTERS='include:/'
	codeql database create --language=javascript --source-root $projRoot QLDBs/$projName
	codeql database upgrade QLDBs/$projName
fi

# run the query
codeql query run --search-path=$ANALYSIS_HOME --database QLDBs/$projName --output=tempOut.bqrs static_cg.ql
codeql bqrs decode --format=csv tempOut.bqrs > $projRoot/static_callgraph.csv
rm tempOut.bqrs
