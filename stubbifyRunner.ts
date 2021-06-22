import * as fs from "fs";
import * as path from 'path';
import { functionStubFile} from './functionLevelStubs.js'
import { fileStubFile} from './fileLevelStubs.js'
import {getTargetsFromACG, getTargetsFromCoverageReport, buildHappyName, buildEvalCheck, getFileName} from './ACGParseUtils.js';
import {argv} from 'yargs';

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

let testingMode = true;		// do we add console.logs?
let recurseThroughDirs = true;

// 2 TODO
if ( (! argv.transform)) {
    console.log('Usage: stubbifyRunner.js --transform [file.js | dir] [[--callgraph callgraphFile.csv] | [--uncovered coverageReport.json]] [--guarded_exec_mode [true | false]]');
    process.exit(1);
}

// 3
let filename: string = argv.transform;
console.log('Reading ' + filename);

// 4
// callgraph -- passing none fun stubs everything
let callgraphpath : string = argv.callgraph;
let coverageReportPath: string = argv.uncovered;
let functions : string[] = [];
let listedFiles: string[] = [];
let noCG : boolean = true;
let uncoveredMode: boolean = !(argv.uncovered == undefined);
let depList: string[];

if ( callgraphpath) {
	let targets: string[] = getTargetsFromACG(callgraphpath);
	functions = targets.map(buildHappyName);
	listedFiles = targets.map(getFileName);
	noCG = false;
}

if ( uncoveredMode) {
	let targets: string[] = getTargetsFromCoverageReport(coverageReportPath);
	functions = functions.concat(targets.map(buildHappyName));

	let all_listedFiles = targets.map(getFileName);
	all_listedFiles.forEach(element => {
		if (listedFiles.indexOf(element) == -1)
			listedFiles.push(element);
	});
	noCG = false;

	console.log(listedFiles);
	console.log(functions);
} 

if (uncoveredMode && callgraphpath) {
	// Remove duplicates for efficiency.
	listedFiles = Array.from(new Set(listedFiles));
	functions = Array.from(new Set(functions));
}

if ( argv.dependencies) {
	depList = fs.readFileSync(argv.dependencies, 'utf-8').split("\n");
}

if( fs.lstatSync(filename).isDirectory()) {
	let files = getAllFiles( filename, recurseThroughDirs);
	
	files.forEach(function(file, index) {
		// console.log(file);
		// only stubify JS files
		let curPath: string = filename + file;
		curPath = file;
		// console.log("decision: " + shouldStubbify(curPath, file, depList));
		// let curAbsPath: string = process.cwd() + curPath;
		if( shouldStubbify( curPath, file, depList)) { // don't even try to stub externs

			if( noCG || listedFiles.indexOf(curPath) > -1) { // file is reachable, so only stubify functions
				console.log("FUNCTION CASE: " + curPath);

				try {
					functionStubFile(curPath, process.cwd(), new Map(), functions, uncoveredMode, safeEvalMode, testingMode);
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

console.log('Done');