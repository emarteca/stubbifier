import * as fs from "fs";
import { parse } from '@babel/parser';
import { default as generate } from '@babel/generator';
import { transformFromAstSync } from '@babel/core';
import * as babel from '@babel/types';
import * as tar from 'tar';
import * as path from 'path';

import {buildHappyName, buildEvalCheck} from './ACGParseUtils.js';

const MIN_FCT_STUB_LENGTH = 5; // only stub functions that are > 5 lines long


// transform the function if: 
// the list of functions to stub is empty (this defaults to the entire set of top level functions in the file -- TODO probably only DEBUG MODE)
// or, if the function name is in the list
// TODO deal with scoping
function shouldTransformFunction(fctName : string, reachableFuns:string[], uncoveredMode: boolean, fctNode: babel.Function): boolean {
	let fctNotInList: boolean = (reachableFuns.indexOf(fctName) == -1);
	if (fctNode.body.type == "BlockStatement") {
		fctNotInList = fctNotInList && (!generate((<babel.BlockStatement> fctNode.body).body[0]).code.startsWith('eval("STUBBIFIER_DONT_STUB_ME");'));
	}
	return fctNotInList;
}

// Remove a function if it is specified in the list of functions to remove.
function shouldRemoveFunction(fctName : string, removeFuns : string[]) {
	return removeFuns.indexOf(fctName) != -1;
}

function shouldTransformBundlerMode(fctNode : babel.Function) : boolean {
	if (fctNode.body.type == "BlockStatement") {
		return generate((<babel.BlockStatement> fctNode.body).body[0]).code == 'eval("STUB_FLAG_STUB_THIS_STUB_FCT");';
	}

	return false;
}

function generateNodeUID(n: babel.Node, filename: string, coverageMode: boolean): string {
	// acorn/src/location.js:<12,12>--<18,1>
	let locString : string;
	if (!coverageMode)
		locString = "<" + n.loc.start.line + "," + n.loc.start.column + ">--<" + n.loc.end.line + "," + n.loc.end.column + ">";
	else {
		locString = "<" + (<any> n).body.loc.start.line + "," + (<any> n).body.loc.start.column + ">--<" + (<any> n).body.loc.end.line + "," + (<any> n).body.loc.end.column + ">";
	}

	return buildHappyName(filename + ":" + locString);
}

function getNumLinesSpannedByNode( n: babel.Node): number {
	return n.loc.end.line - n.loc.start.line;
}

/*
	processAST: do it
*/
function processAST(ast: babel.Program, 
					functionsToStub : Map<string, string>, 
					reachableFuns : string[], 
					filename: string, 
					uncoveredMode: boolean, 
					safeEvalMode = false, 
					bundlerMode = false,
					removeFuns) : babel.Program { 

	// let funcMap : Map<string, [babel.Identifier[], babel.BlockStatement]> = new Map();
	let supportedFunctionNodes : string[] = [
		"FunctionExpression", 
		"FunctionDeclaration", 
		"ArrowFunctionExpression", 
		"ClassMethod",
		"ObjectMethod",
	];


	let output = transformFromAstSync( ast, null, { ast: true, plugins : [ function processAST() { return { visitor: {
		Function(path) {
			// let inFunction: boolean = path.findParent((path) => path.isFunction());
			if ( supportedFunctionNodes.indexOf(path.node.type) > -1  /*&& ! inFunction*/ && getNumLinesSpannedByNode(path.node) > MIN_FCT_STUB_LENGTH) {
				// let functionUIDName = "global::" + path.node.id.name;
				let functionUIDName = generateNodeUID(path.node, filename, uncoveredMode);
				// don't forget to write out function body before we replace
				if (shouldRemoveFunction(functionUIDName, removeFuns)) {
					// This if is duplicated from below.
					if (path.node.kind == "constructor" || path.node.generator || path.node.async) { // TODO broken for generators -- is this true?
						path.skip(); // don't transform a constructor or anything in a constructor (stubs dont work with "super" and "this")
					} else {
						path.node.body = babel.blockStatement([babel.throwStatement(
							babel.newExpression(
								babel.identifier("Error"),
								[babel.stringLiteral('[Stubbifier] Function was removed!')]	
							)
						)]);
					}
				} else if ((bundlerMode && shouldTransformBundlerMode(path.node)) || (shouldTransformFunction(functionUIDName, reachableFuns, uncoveredMode, path.node))) {
					if (path.node.kind == "constructor" || path.node.generator || path.node.async) { // TODO broken for generators -- is this true?
						path.skip(); // don't transform a constructor or anything in a constructor (stubs dont work with "super" and "this")
					} else {
						let inClassOrObjMethod: babel.Node = path.findParent((path) => { 
																if(path.isClassMethod() || path.isObjectMethod()) 
																	return path; 
															});
						if (path.node.type == "ClassMethod" || path.node.type == "ObjectMethod" || inClassOrObjMethod) {
							// It's a constructor, getter, or setter.

							let afun : babel.ArrowFunctionExpression = babel.arrowFunctionExpression(
								path.node.params,
								path.node.body,
								path.node.async
							);

							functionsToStub.set(functionUIDName, generate(afun).code);

							if( path.node.type == "ClassMethod" || path.node.type == "ObjectMethod") {
								if( !path.node.key.name) {
									path.node.body = generateNewClassMethodNoID( functionUIDName, path.node.key, path.node.type == "ArrowFunctionExpression");
								} else {
									path.node.body = generateNewClassMethodWithID( functionUIDName, path.node.key.name, path.node.kind, path.node.type == "ArrowFunctionExpression");
								}
							} else { // this is the inClassOrObjMethod
								if (path.node.id && path.node.id.name) {
									path.node.body = generateNewFunctionWithID( functionUIDName, path.node.id.name, path.node.type == "ArrowFunctionExpression");
								} else {
									// can't do the transformation if there's no name. because, there is no way to 
									// refer to a function with no name, inside a class method. our normal strategy of using "this" doesn't
									// work since inside a class it would refer to the class instance
									functionsToStub.delete( functionUIDName); // delete from map -- needed to add first bc path.node.body changes
									path.skip();
								}
							}
						} else {
							functionsToStub.set(functionUIDName, generate(path.node).code);

							let forbiddenFunctionReassignments = [
								"VariableDeclarator",
								"CallExpression", 
								"AssignmentExpression",
								"ReturnStatement",
								"ObjectProperty"
							]

							path.node.body = (path.node.id && path.node.id.name && (forbiddenFunctionReassignments.indexOf(path.parentPath.node.type) == -1)) ? 
													generateNewFunctionWithID( functionUIDName, path.node.id.name, path.node.type == "ArrowFunctionExpression") :
													generateNewFunctionNoID( functionUIDName, path.node.type == "ArrowFunctionExpression");
							if( path.node.type == "ArrowFunctionExpression") {
								path.node.params = [babel.restElement(babel.identifier("args_uniqID"))];
							}
						}
					}
				}	
			}
		},
	}}}]});

	return output.ast;
}

// if we know the function ID, then we can reassign it from inside itself
function generateNewFunctionWithID(scopedFctName : string, fctID: string, isArrowFunction = false): babel.BlockStatement {
	let argsName = isArrowFunction? "args_uniqID" : "arguments";
	let newFunctionBodyString: string = `let toExec = eval(stubs.getCode("${scopedFctName}"));
										 toExec = stubs.copyFunctionProperties(${fctID}, toExec);
									     ${fctID} = toExec;
									     return toExec.apply(this, ${argsName});`
	return babel.blockStatement( parse(newFunctionBodyString, 
										{allowReturnOutsideFunction : true, sourceType: "unambiguous", 
										 plugins: [ "classProperties"]}).program.body);
}

// if the function does not have an ID (i.e. an anonymous function) or if the ID is not an identifier (i.e. a dynamically named function)
// then, we need to store it in the stubsmap
function generateNewFunctionNoID(scopedFctName : string, isArrowFunction = false): babel.BlockStatement {
	let argsName = isArrowFunction? "args_uniqID" : "arguments";
	let newFunctionBodyString: string = `let fctID = "${scopedFctName}";
									     let toExecString = stubs.getStub(fctID);
									     if (! toExecString) {
									       toExecString = stubs.getCode(fctID);
									       stubs.setStub(fctID, toExecString);
									     }
									     let toExec = eval(toExecString);
									     toExec = stubs.copyFunctionProperties(this, toExec);
        								 toExec.stubbifierExpandedStub = true;
									     return toExec.apply(this, ${argsName});`
	return babel.blockStatement( parse(newFunctionBodyString, 
										{allowReturnOutsideFunction : true, sourceType: "unambiguous", 
										 plugins: [ "classProperties"]}).program.body);
}

// for class methods, we can redefine them from inside themselves
// but the format is different from nonclass methods: we need to use this.__proto__.ID
function generateNewClassMethodWithID(scopedFctName : string, fctID: string, kind: string, isArrowFunction = false): babel.BlockStatement {
	let argsName = isArrowFunction? "args_uniqID" : "arguments";
	let fctDefString: string = `this.${fctID} = toExec;`; // default callExpression
	let fctLookupString: string = `this.${fctID}`;
	switch(kind) {
		case "get" :
			fctDefString = `this.__defineGetter__(\"${fctID}\", toExec);`
			fctLookupString = `this.__lookupGetter__(\"${fctID}\")`;
			break;
		case "set":
			fctDefString = `this.__defineSetter__(\"${fctID}\", toExec);`
			fctLookupString = `this.__lookupSetter__(\"${fctID}\")`;
			break;
	}
	let newFunctionBodyString: string = `let toExec = eval(stubs.getCode("${scopedFctName}"));
										 toExec = stubs.copyFunctionProperties(${fctLookupString}, toExec);
									     ${fctDefString}
									     return toExec.apply(this, ${argsName});`
	return babel.blockStatement( parse(newFunctionBodyString, 
										{allowReturnOutsideFunction : true, sourceType: "unambiguous", 
										 plugins: [ "classProperties"]}).program.body);
}

function generateNewClassMethodNoID(scopedFctName : string, key : babel.Node, isArrowFunction = false): babel.BlockStatement {
	let argsName = isArrowFunction? "args_uniqID" : "arguments";
	let newFunctionBodyString: string = `let fctID = "${scopedFctName}";
										 let toExecString = stubs.getStub(fctID);
										 if (! toExecString) {
									       toExec = stubs.getCode(fctID);
									       stubs.setStub(fctID, toExecString);
									     }
									     let toExec = eval(toExecString);
									     toExec = stubs.copyFunctionProperties(this[${generate(key).code}], toExec);
									     return toExec.apply(this, ${argsName});`
    return babel.blockStatement( parse(newFunctionBodyString, 
										{allowReturnOutsideFunction : true, sourceType: "unambiguous", 
										 plugins: [ "classProperties"]}).program.body);
}

function stubifyFile(filename: string, stubspath: string, functionsToStub: Map<string, string>, reachableFuns : string[], removeFuns : string[], uncoveredMode: boolean,
					 safeEvalMode = false, testingMode = false, zipFiles = false, bundleMode = false) {

	// save the old file 
	// this might get removed later, but is useful right now for debugging
	fs.copyFileSync(filename, filename + ".original");

	let code: string = fs.readFileSync(filename, 'utf-8');
	// let origCodeFileName: string = process.cwd() + "/" + filename + ".BIGG";
	let ast: babel.Program;
	let esmMode: boolean = false;
	try {
		ast = parse(code, {sourceType: "unambiguous", plugins: [ "classProperties", "typescript" ]}).program;
		esmMode = ast.sourceType == "module";
	} catch(e) {
		console.error("Yikes... parsing error in " + filename + ":  " + e);
		return;
	}

	// Preprocess the AST, propagating function ID information to FunctionExpressions.
	ast = processAST(ast, functionsToStub, reachableFuns, filename, uncoveredMode, safeEvalMode, bundleMode, removeFuns);

	let setup_stubs: string = "let stubs = new (require('" + stubspath + "/stubbifier_cjs.cjs'))('" + filename + "', " + testingMode + ");";
	if(esmMode) {
		setup_stubs = "import {default as stubs_fct} from '" + stubspath + "/stubbifier_es6.mjs'; let stubs = new stubs_fct('" + filename + "', " + testingMode + ");";
	}

	ast = transformFromAstSync( ast, null, { ast: true ,
			plugins: [
				function visitAndAddStubsSetup() {
					return {
						visitor: {
							Program(path) {
								path.node.body = (parse(setup_stubs, {sourceType: "unambiguous"}).program.body).concat(path.node.body);
								path.skip();
							}
						}
					}
				}
			]
		}).ast

	// console.log(generate(ast).code)
	// write out the stub, overwriting the old file
	fs.writeFileSync( filename, generate(ast).code.split('eval("STUB_FLAG_STUB_THIS_STUB_FCT");').join("\n"));

	// make the directory, so there can be a file added to it for each function processed
	// only create the dir if it doesn't already exist
	if ( ! fs.existsSync(filename + ".dir")) {
		fs.mkdirSync(filename + ".dir");
	}

	// then, write out all the functions to be stubbified 
	// forEach for a map iterates over: value, key
	functionsToStub.forEach( ( fctBody, fctName, map) => {
		if(bundleMode) {
			fctBody = fctBody.split('eval("STUB_FLAG_STUB_THIS_STUB_FCT");').join("\n");
		}
		let stubFileBody: string = "let " + fctName + " = " + fctBody + "; \n\n" + fctName + ";"

		// TODO: currently in safeEvalMode we check to see if console.log is eval
		if(testingMode) {
			console.log(`[STUBBIFIER METRICS] function stubbed: ${fctName} --- ${filename}`);
			stubFileBody = `console.log("[STUBBIFIER METRICS] EXPANDED STUB HAS BEEN CALLED: ${fctName} --- ${filename}");` + stubFileBody;
		}
		
		if (safeEvalMode) {
			stubFileBody = "let dangerousFunctions = [eval]; if( process){dangerousFunctions += [process.exec]};\n" + stubFileBody;
		}

		/* debug */
		// let fileSpecAST = parse(stubFileBody, {sourceType: "unambiguous", plugins: [ "classProperties"]}).program;
		let fileSpecAST : any = {}; 
		try {
			fileSpecAST = parse(stubFileBody, {allowSuperOutsideMethod : true, sourceType: "unambiguous", plugins: [ "classProperties"]}).program;
		} catch(e) {
			console.error("Big oof bro... error parsing following snippet. Error: " + e);
			console.error(stubFileBody);
			process.exit(0);
		}

		fileSpecAST = transformFromAstSync( fileSpecAST, null, { ast: true, plugins : [ function addTests() { return { visitor: {
						CallExpression(path) {
							if (safeEvalMode && ! path.node.isNewCallExp && ! (path.node.callee.type == "Super")) {
								//let enclosingStmtNode = path.findParent((path) => path.isStatement());
								//enclosingStmtNode.insertBefore(buildEvalCheck(path.node));
								let inAsyncFunction: boolean = path.findParent((path) => path.isFunction() && path.node.async);
								let newWrapperCall: babel.CallExpression = buildEvalCheck(path.node, inAsyncFunction, filename);
								(<any>newWrapperCall).isNewCallExp = true;
								path.replaceWith(newWrapperCall);
							}
						},
					}}}]}).ast;
		fs.writeFileSync(filename + ".dir/" + fctName + ".BIGG", generate(fileSpecAST).code);
		// console.log(fctBody);
	});

	// Now that the directory is written, zip it up (if we want to).
	if (zipFiles) {
		let justFile : string = path.basename(filename);
		let pathToFile : string = path.dirname(filename);
	
		tar.c({ 
			gzip: true, // this will perform the compression too
			sync: true,
			cwd: process.cwd() + '/' + pathToFile
		}, [justFile + ".dir"] ).pipe(fs.createWriteStream(filename + ".dir" + '.tgz'));
	
		// Once zipped, delete the existing directory.
		fs.rmdirSync(filename + ".dir", { recursive: true });
	}
}

// 2
// if (process.argv.length < 3) {
//     console.log('Usage: fileLevelStubs.js [file.js | dir]');
//     process.exit(1);
// }

// // 3
// let filename: string = process.argv[2];
// console.log('Reading ' + filename);

// // 4
// // callgraph
// let callgraphpath : string = process.argv[3];
// let reachableFuns : string[] = [];
// let reachableFiles: string[] = [];
// if (callgraphpath) {
// 	let targets: string[] = getTargetsFromACG(callgraphpath);
// 	reachableFuns = targets.map(buildHappyName);
// 	reachableFiles = targets.map(getFileName);
// }

// // console.log("Reachable funs:");
// // console.log(reachableFuns);
// // console.log(reachableFiles);

// // read in file
// // write out to another file temp
// // replace AST of file with: read in temp; eval it 

// let safeEvalMode = true;
// let testingMode = true;

// if(fs.lstatSync(filename).isFile()) {
// 	stubifyFile(filename, process.cwd(), new Map(), reachableFuns, safeEvalMode, testingMode);
// } else if( fs.lstatSync(filename).isDirectory()) {
// 	fs.readdir(filename, function (err, files) {
// 		if(err) {
// 			console.log("Problem reading specified input directory");
// 			process.exit(1);
// 		}
// 		// apply the transformer to each JS file in the directory
// 		files.forEach(function(file, index) {
// 			// only stubify JS files
// 			let curPath: string = filename + file;
// 			// console.log(curPath);
// 			if( file.substr(file.length - 2) == "js") {
// 				stubifyFile(curPath, process.cwd(), new Map(), reachableFuns, safeEvalMode, testingMode);
// 			}
// 		});
// 	});
// } else {
// 	console.log("Error: input to transformer must be a directory or a file");
// }


// console.log('Done');


export {stubifyFile as functionStubFile}
