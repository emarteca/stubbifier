import * as fs from "fs";
import * as path from 'path';
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
let recurseThroughDirs = true;

if ( (! argv.to_measure_size)) {
    console.log('Usage: getCodeSize.js --to_measure_size [file.js | dir] <optional: --dependencies dep_list_file>');
    process.exit(1);
}

let filename: string = argv.to_measure_size;
console.log('Reading ' + filename);


let depList: string[];
if ( argv.dependencies) {
	depList = fs.readFileSync(argv.dependencies, 'utf-8').split("\n");
}

if( fs.lstatSync(filename).isDirectory()) {
	let files = getAllFiles( filename, recurseThroughDirs);
	let totalSize = 0;
	files.forEach(function(file, index) {
		// only get size of JS files (since that's all that we're stubbifying)
		let curPath: string = filename + file;
		curPath = file;
		if( shouldStubbify( curPath, file, depList)) { // this is all the files the stubbifyier looks at (i.e. js files, 
			totalSize += fs.statSync(curPath).size;    // in dependencies in node_modules or in the source code)
		}
	});

	console.log("Total size: " + totalSize  + " bytes");
} else if( fs.lstatSync(filename).isFile()) {
	let totalSize = fs.statSync(filename).size;
	console.log("Total size (of one file): " + totalSize  + " bytes");
} else {
	console.log("Error: input to code size must be a directory or a file: it should be the same input as to the transformer");
}

console.log('Done');