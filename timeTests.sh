#!/bin/bash

# example call:
# ./timeTests.sh numRuns playground/css-loader css-loader <optional: numWarmupRuns>
# output: tests_css-loader_numRunsruns.out (test output)
#	  time_css-loader_numRunsruns.out (output from time command)

numRuns=$1
testDir=$2
projName=$3
curDir=`pwd`
testOutFile="$curDir/ExpData/tests_$3_$1runs.out"
timeOutFile="$curDir/ExpData/time_$3_$1runs.out"

if [ ! -d "ExpData" ]; then
	mkdir ExpData
fi

# if the time output file or test output file already exist, 
# delete them, to avoid repeatedly appending and polluting the old 
# data (move them to _old to avoid accidental deletion)
if test -f "$testOutFile"; then
	mv $testOutFile `echo $testOutFile`_old
fi
if test -f "$timeOutFile"; then
	mv $timeOutFile `echo $timeOutFile`_old
fi

warmups=0
if (( "$#" > 3 )); then
	warmups=$4
fi

cd $testDir
for (( x=0; x<$warmups; x++ )); do
	echo "Warmup run: "$x" of "$warmups
	# run some tests into the void 
	npm run test > /dev/null 2>&1
done

rm -rf /tmp/* > /dev/null 2>&1

for x in $(eval echo {1..$1}); do
	echo "Running test suite:" $x "for" $projName
 	{ time (npm run test >> $testOutFile 2>&1) ; } 2>>$timeOutFile
	echo "Done running test suite, cleaning up now..."
	rm -rf /tmp/* > /dev/null 2>&1
done

cd $curDir
