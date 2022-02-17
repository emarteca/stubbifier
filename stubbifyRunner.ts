import * as fs from "fs";
import * as path from 'path';
import { functionStubFile} from './functionLevelStubs.js'
import { flagFunctionForStubbing} from './functionFlagging.js'
import { fileStubFile} from './fileLevelStubs.js'
import {getTargetsFromACG, getTargetsFromCoverageReport, buildHappyName, buildEvalCheck, getFileName, generateBundlerConfig} from './ACGParseUtils.js';
import {argv} from 'yargs';
import { execSync } from "child_process";
import { debugPort } from "process";

const getAllFiles = function( dirname, recurse = false, listOfFiles = []) {
	let baseListOfFiles = fs.readdirSync( dirname);

	baseListOfFiles.forEach(function(file) {
		if (fs.statSync(dirname + "/" + file).isDirectory() && recurse) {
			listOfFiles = getAllFiles(dirname + "/" + file, recurse, listOfFiles);
		} else {
			listOfFiles.push(path.join(__dirname, dirname, "/", file));
		}
	});

	return listOfFiles;
}

function shouldStubbify( curPath: string, file: string, depList: string[]): boolean {
	let shouldStub = fs.lstatSync(curPath).isFile() && file.substr(file.length - 2) == "js" && file.indexOf("externs") == -1 && file.indexOf("node_modules/@babel") == -1 
						&& (file.indexOf("test") == -1 || file.indexOf("node_modules") > -1);
	if( depList) {
		let node_mod_index = curPath.split("/").indexOf("node_modules");
		if ( node_mod_index > -1) { // if it's a node_module and we have a dep list, need to make sure it's in the dep list 
			shouldStub = shouldStub && (depList.indexOf(curPath.split("/")[node_mod_index + 1]) > -1)
		}
	}
	return shouldStub;
}

/*
		PROJECT FLAGS
*/
let safeEvalMode = true;	// do we try to intercept evals? default is true

if (argv.guarded_exec_mode == "false") 
	safeEvalMode = false;

let bundlerMode = "no";	// default: don't bundle

// valid options are:
// "no" : dont bundle
// "only_bundle" : bundle but don't stub anything
// "stub_bundle" : stub an existing bundle file (this requires the bundle to have been previously created)
// "bundle_and_stub" : both stub and bundle
if (argv.bundler_mode) 
	bundlerMode = argv.bundler_mode;
if (bundlerMode != "no" && bundlerMode != "only_bundle" && bundlerMode != "stub_bundle" && bundlerMode != "bundle_and_stub") {
	console.log("Invalid bundle option provided: " + bundlerMode + "; proceeding without bundling");
	bundlerMode = "no";
}

let testingMode = true;		// do we add console.logs?
let recurseThroughDirs = true;

// 2 TODO
if ( (! argv.transform) || ( argv.callgraph && argv.uncovered)) {
    console.log('Usage: stubbifyRunner.js --transform [file.js | dir] [[--callgraph callgraphFile.csv] | [--uncovered coverageReport.json]] [--guarded_exec_mode [true | false]] [--bundler_mode [true | false]] [--removeFuns file_of_list_of_functions_to_completely_remove]');
    process.exit(1);
}

// 3
let filename: string = argv.transform;
console.log('Reading ' + filename);

// 4
// callgraph -- passing none fun stubs everything
let callgraphpath : string = argv.callgraph;
let coverageReportPath: string = argv.uncovered;
let removeFunsPath = argv.removeFuns;
let functions : string[] = [];
let listedFiles: string[] = [];
let removeFuns : string[] = [];
let noCG : boolean = true;
let uncoveredMode: boolean = !(argv.uncovered == undefined);
let depList: string[];

if ( callgraphpath) {
	let targets: string[] = getTargetsFromACG(callgraphpath);
	functions = targets.map(buildHappyName);
	listedFiles = targets.map(getFileName);
	noCG = false;
}
let zipFiles = false; // Currently don't ever do this.

if (removeFunsPath) {
	const targetsForRemoval = getTargetsFromACG(removeFunsPath);
	listedFiles = listedFiles.concat(targetsForRemoval.map(getFileName));
	removeFuns = targetsForRemoval.map(buildHappyName);
	noCG = false;
}

if ( uncoveredMode) {
	let targets: string[] = getTargetsFromCoverageReport(coverageReportPath);
	functions = targets.map(buildHappyName);

	let all_listedFiles = targets.map(getFileName);
	all_listedFiles.forEach(element => {
		if (listedFiles.indexOf(element) == -1)
			listedFiles.push(element);
	});
	noCG = false;
} 

if ( argv.dependencies) {
	depList = fs.readFileSync(argv.dependencies, 'utf-8').split("\n");
}

if (bundlerMode != "no") {
	if (bundlerMode == "bundle_and_stub" || bundlerMode == "only_bundle") {
		let files = getAllFiles( filename, recurseThroughDirs);
		
		files.forEach(function(file, index) {
			let curPath: string = filename + file;
			curPath = file;
			if( shouldStubbify( curPath, file, depList)) { // don't even try to stub externs

				if( noCG || listedFiles.indexOf(curPath) > -1) { // file is reachable, so only stubify functions
					console.log("FUNCTION CASE: flagging to be stubbed: " + curPath);

					try {
						flagFunctionForStubbing(curPath, process.cwd(), functions, uncoveredMode);
					}catch(e) {
						console.log("ERROR: cannot stubbify function in: " + curPath);
					}
				} else {
					console.log("FILE CASE: flagging all functions to be stubbed in: " + curPath);
					
					try {
						flagFunctionForStubbing(curPath, process.cwd(), [], uncoveredMode);
					}catch(e) {
						console.log("ERROR: cannot stubbify all functions in file: " + curPath);
						// console.log(e);
					}
				}
			}
		});
		// By now, the functions that should be stubbed are flagged as such with 
		// eva("STUB_FLAG_STUB_THIS_STUB_FCT") as the first thing in the function body.

		// Now, we need to call the bundler.
		// To do this, we should just dispatch a shell command which invokes the bundler.
		// Notes:
		// 1. Bundler needs to be installed globally.
		// 2. Bundler needs to be called from the project being stubbified.
		// 3. Bundler config file is needed. 
			
		// create bundler config file
		generateBundlerConfig(path.resolve(filename));
		// cd into project directory (filename is the path to the tgt project)
		// save current directory first to chdir back
		let stubsDir = process.cwd();
		process.chdir(path.resolve(filename));
		// install bundler dependencies
		execSync('npm install @rollup/plugin-node-resolve @rollup/plugin-babel @rollup/plugin-commonjs @rollup/plugin-json')
		// call bundler
		execSync('rollup --config rollup.stubbifier.config.js');
		// cd back into stubbifier
		process.chdir(stubsDir);
	}

	// Once bundled, we need to read in the bundle and stubbify the functions with
	// the eval.
	if (bundlerMode == "bundle_and_stub" || bundlerMode == "stub_bundle")
		functionStubFile(path.resolve(filename) + '/stubbifyBundle.js', process.cwd(), new Map(), functions, removeFuns, uncoveredMode, safeEvalMode, testingMode, zipFiles, true);
} else {
	// stubbing section; no bundling 
	if( fs.lstatSync(filename).isDirectory()) {
		let files = getAllFiles( filename, recurseThroughDirs);
		
		files.forEach(function(file, index) {
			// console.log(file);
			// only stubify JS files
			// let curPath: string = filename + file;
			const curPath = file;
			// console.log("decision: " + shouldStubbify(curPath, file, depList));
			// let curAbsPath: string = process.cwd() + curPath;
			if( shouldStubbify( curPath, file, depList)) { // don't even try to stub externs

				if( noCG || listedFiles.indexOf(curPath) > -1) { // file is reachable, so only stubify functions
					console.log("FUNCTION CASE: " + curPath);

					try {
						functionStubFile(curPath, process.cwd(), new Map(), functions, removeFuns, uncoveredMode, safeEvalMode, testingMode);
					}catch(e) {
						console.log("ERROR: cannot stubbify function in: " + curPath);
						// console.log(e);
					}
				} else {
					console.log("FILE CASE: " + curPath);
					
					try {
						fileStubFile(curPath, safeEvalMode, testingMode);
					}catch(e) {
						console.log("ERROR: cannot stubbify file: " + curPath);
						// console.log(e);
					}
				}
				
			}
			});
	} else {
		console.log("Error: input to transformer must be a directory");
	}
}

console.log('Done');
