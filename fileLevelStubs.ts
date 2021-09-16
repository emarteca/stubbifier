import * as fs from "fs";
import { parse } from '@babel/parser';
import { default as generate } from '@babel/generator';
import { transformFromAstSync } from '@babel/core';
import * as babel from '@babel/types';
import * as zlib from 'zlib';
import { Readable } from 'stream';

import { buildEvalCheck } from './ACGParseUtils.js';

const MIN_FILE_STUB_LENGTH = 5; // only stub files that are > 5 lines

// moving import statements to the original code
function processAST(ast: babel.Program, importStmts:babel.Node[], exportStmts: Record<string,babel.Node[]>, filename: string, safeEvalMode = false) : babel.Program { 
	// console.log(code);
	let output = transformFromAstSync(ast, null, {ast : true, plugins: [ function processPlugin() { return { visitor: {
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

		/*
			Deal with imports.
			Imports *always* stay in the original file, and they never modify anything.
		*/
		ImportDeclaration(path) {
			importStmts.push(path.node); // put node into stmt move list
			path.remove(); // yeet the node into the void
			path.skip();
		},
		/*
			Deal with exports.
			There are multiple different kinds of exports, and in some cases we need to leave
			part of the export to ensure that e.g. certain variables remain in scope.

			e.g.
			export const exportFoo = foo;

			Here, we need to leave `const exportFoo = foo`, as the assignment makes `exportFoo`
			available in the subsequent scope.
		*/
		ExportDefaultDeclaration(path) {
			// Check if export has a declaration.
			if (path.node.declaration !== null) {
				// Construct new node based on the export.
				// Save the declaration that we're going to replace.
				let savedDeclaration  = path.node.declaration; // the actual type here is a giant union type (88 members, don't feel like typing it)
				exportStmts["default"].push(path.node);
				// Remove the declaration.
				// path.node.declaration = null;
				// previous line of code not required: we always replace the declaration with something else
				// and, babel will not allow the ExportDefaultDeclaration to have a null declaration
				// Modify path.node to have the appropriate exports, based on the type of export it is.
				switch(savedDeclaration.type) {
					case "ClassDeclaration" :
						// TODO: Doing the same thing twice for local and exported. Ensure that this is what we want.
						path.node.declaration = (<babel.ClassDeclaration>savedDeclaration).id;
						path.replaceWith(savedDeclaration);
						break;
					case "FunctionDeclaration" :
						path.node.declaration = (<babel.FunctionDeclaration>savedDeclaration).id;
						path.replaceWith(savedDeclaration);
						break;
					default :
						path.remove(); // in babel, identifiers count as declarations
					// 	path.node.declaration = savedDeclaration; // I don't think you can have a vardecl as a default export ...?
					/* TODO: more cases */
				}
			} else {
				// this might be unreachable with babel, but keep it around just in case
				exportStmts["default"].push(path.node);
				path.remove();
			}
			// return false;
			path.skip();
		},
		ExportNamedDeclaration(path) {
			// Check if export has a declaration.
			if (path.node.declaration !== null) {
				// Construct new node based on the export.
				// Save the declaration that we're going to replace.
				let savedDeclaration : babel.Declaration = path.node.declaration;
				// Remove the declaration.
				// path.node.declaration.parentPath.remove();
				path.node.declaration = null
				// Modify path.node to have the appropriate exports, based on the type of export it is.
				switch(savedDeclaration.type) {
					case "ClassDeclaration" :
						// TODO: Doing the same thing twice for local and exported. Ensure that this is what we want.
						// need to have 2 different identifiers, to avoid shallow copy issues
						path.node.specifiers.push(babel.exportSpecifier(babel.identifier((<babel.ClassDeclaration>savedDeclaration).id.name), 
																		babel.identifier((<babel.ClassDeclaration>savedDeclaration).id.name)));
						break;
					case "FunctionDeclaration" :
						path.node.specifiers.push(babel.exportSpecifier(babel.identifier((<babel.FunctionDeclaration>savedDeclaration).id.name), 
																		babel.identifier((<babel.FunctionDeclaration>savedDeclaration).id.name)));
						break;
					case "VariableDeclaration" :
						let lsd :babel.VariableDeclaration = (<babel.VariableDeclaration>savedDeclaration);
					 	for (let v of lsd.declarations) {
							/* There are only two cases here: VariableDeclator (which is horrible), and Identifier (cleaner). */
							/* TODO: currently just casting the .id to an Identifier, even though it's
								a PatternKind. 
							
								Change to deal with other possible PatternKinds.
							*/
							switch ((<babel.VariableDeclarator>v).id.type) {
								case "Identifier" :
									let idAsIdentifierLocal: babel.Identifier = babel.identifier((<babel.Identifier>(<babel.VariableDeclarator>v).id).name);
									let idAsIdentifierExport: babel.Identifier = babel.identifier((<babel.Identifier>(<babel.VariableDeclarator>v).id).name);
									path.node.specifiers.push(babel.exportSpecifier(idAsIdentifierLocal, idAsIdentifierExport));
									break;
								case "ObjectPattern" :
									let idAsObjectPattern :babel.ObjectPattern = <babel.ObjectPattern>(<babel.VariableDeclarator>v).id;
									idAsObjectPattern.properties.map((v) => {
										/* v has to have type Identifier as per destructured assignment specification */
										let propertyAsExportIdentifier :babel.Identifier = <babel.Identifier>(<babel.Property>v).key;
										path.node.specifiers.push(babel.exportSpecifier(propertyAsExportIdentifier, propertyAsExportIdentifier));
									})
									break;
								default :
									console.error(`Unexpected case of VariableDeclarator: ${(<babel.VariableDeclarator>v).id.type}`);
									process.exit(1);
									
							}
							
						}
						break;
					/* TODO: more cases */
				}
				exportStmts["named"].push(path.node);
				// Replace it with the declaration.
				path.replaceWith(savedDeclaration);
			} else {
				exportStmts["named"].push(path.node);
				path.remove();
			}
			path.skip();
		}
	}}}]});
	return output.ast;
}

// TODO: stubbify, not stubify
function stubifyFile(filename: string, safeEvalMode = false, testingMode = false, zipFiles = false) {
	// save the old file 
	// this might get removed later, but is useful right now for debugging
	fs.copyFileSync(filename, filename + ".original");

	let code: string = fs.readFileSync(filename, 'utf-8');

	// check if the file is long enough to bother stubbifying
	if ((code.match(/\n/g)||[]).length < MIN_FILE_STUB_LENGTH) {
		return;
	}

	let origCodeFileName: string = filename + ".BIGG";
	let ast: babel.Program;
	let esmMode: boolean;
	try {
		ast = parse(code, {sourceType: "unambiguous", plugins: [ "classProperties", "typescript" ]}).program;
		esmMode = ast.sourceType == "module";
	} catch(e) {
		console.error("Yikes... parsing error in " + filename + ":  " + e);
		return;
	}

	let importStmts: babel.Statement[] = [];
	let exportStmts: Record<string,babel.Statement[]> = {"default": [], "named": []};
	ast = processAST(ast, importStmts, exportStmts, filename, safeEvalMode);
	let requires: string = "const fs_uniqID = require('fs'); const zlib_uniqID = require('zlib');";
	if(esmMode) {
		requires = "import * as fs_uniqID from 'fs'; import * as zlib_uniqID from 'zlib';";
	}

	// TODO: kinda dumb that we unzip then reread but ok for now.
	let body: string = `
		if (!fs_uniqID.existsSync(\"${origCodeFileName}\")) {
			var gunzip = zlib_uniqID.gunzipSync;
			var inp = fs_uniqID.createReadStream(\"${origCodeFileName}.gz\");
			var out = fs_uniqID.createWriteStream(\"${origCodeFileName}\");
			inp.pipe(gunzip).pipe(out);
		}
		let fileContents = fs_uniqID.readFileSync(\"${origCodeFileName}\", 'utf-8'); 
		let result_uniqID = eval(fileContents);` 

	if (!esmMode) {
		body += "\nmodule.exports = result_uniqID;";
	}

	if(testingMode) {
		console.log(`[STUBBIFIER METRICS] file stubbed: ${filename}`);
		body = "console.log(\"[STUBBIFIER METRICS] FILE STUB HAS BEEN EXPANDED: " + filename + "\");" + body; 
	}

	//console.log((<babel.ExportNamedDeclaration> exportStmts.named[0]).specifiers)
	// create the exports:
	// for each named export, we need to create a variable declaration of the NE.specifiers[i].local.name
	// export NE.specifiers[i].local as NE.specifiers[i].exported
	let exportVars: string = "";
	let evalExports: string = "let evalRetVal = {";
	if(esmMode) {
		for( let NE of (<babel.ExportNamedDeclaration[]> exportStmts.named)) {
			for (let spec of NE.specifiers) {
				// TODO: Why is the type wrong here?
				if (spec.type == "ExportSpecifier") {
					exportVars += "let " + spec.local.name + "_uniqID = result_uniqID[\"" + spec.local.name + "\"];"
					evalExports += spec.local.name + " : " + generate(spec.local).code + ", ";
					spec.local.name += "_uniqID";
				}
			}
		}

		if (exportStmts.default.length == 1) {
			exportVars += "export default result_uniqID[\"default\"];";
			evalExports += "default : " + generate((<babel.ExportDefaultDeclaration> exportStmts.default[0]).declaration).code
		}
		evalExports += "}; evalRetVal;";
	}

	let outputAST: babel.Program = parse(requires + body + exportVars, {sourceType: "unambiguous"}).program;
	if(esmMode) {
		// add import statements to the start of the stub, and exports to the end
		outputAST = transformFromAstSync( outputAST, null, { ast: true,
			plugins: [
				function visitAndAddImpExps() {
					return { 
						visitor: {
							Program(path) {
								path.node.body = importStmts.concat(path.node.body);
								for (let [expKey, expVal] of Object.entries(exportStmts)) {
									if (expKey != "default") {
										path.node.body = path.node.body.concat(expVal);
									}
								}
								path.skip()
							}
						}
					};
				}
			]
		}).ast

		// add the evalRetVal to the end of the old code, so if it's loaded in 
		// the exports in the stub will work as expected
		ast = transformFromAstSync( ast, null, { ast: true ,
			plugins: [
				function visitAndAddEvalExports() {
					return {
						visitor: {
							Program(path) {	
								path.node.body = path.node.body.concat(parse(evalExports, {sourceType: "unambiguous"}).program.body);
								path.skip();
							}
						}
					}
				}
			]
		}).ast
	}

	// write out stub, overwriting the original file
	// Debug: adding "help"
	fs.writeFileSync(filename, generate(outputAST).code);

	// write out old code, post whatever processing is required
	let codeBodyOutput: string = generate(ast).code;
	if (safeEvalMode) {
		codeBodyOutput = "let dangerousFunctions = [eval]; if( process){dangerousFunctions += [process.exec]}; dangerousFunctions += [require('child_process').execSync, require('child_process').exec];" + codeBodyOutput;
	}

	if (!esmMode) {
		codeBodyOutput += "\nmodule.exports;";
	}

	// were writing out the original code as-is.
	// fs.writeFileSync(origCodeFileName, codeBodyOutput);
	// instead write out a zipped version, to conserve space.
	if (zipFiles) {
		var gzip = zlib.createGzip();
		var out = fs.createWriteStream(origCodeFileName + '.gz');
		Readable.from(codeBodyOutput).pipe(gzip).pipe(out);
	} else {
		fs.writeFileSync(origCodeFileName, codeBodyOutput);
	}
}

function stubifyDirectory(dirname: string, filesToRead: string[], safeEvalMode = false, testingMode = false) {
	// check the package.json in the root of the directory (if it exists)
	// to check the type property (if it exists)
	// to see if this project uses ES6 modules (i.e. imports/exports)
	// default is that this is not the case 
	let esmMode: boolean = false;
	try {
		let json = JSON.parse(fs.readFileSync(dirname + "/package.json", 'utf-8'));
		esmMode = json.type == "module";
	} catch(e) {} // if there's an error, then we're not using esm

	// apply the transformer to each JS file in the list
	filesToRead.forEach(function(file, index) {
		// only stubify JS files
		let curPath: string = dirname + "/" + file;
		if( file.substr(file.length - 3) == ".js") {
			stubifyFile(curPath, safeEvalMode, testingMode);
		}
	});
}

// 2
// if (process.argv.length < 3) {
//     console.log('Usage: node fileLevelStubs.js (file.js | dir) [toStubList.txt]');
//     process.exit(1);
// }

// 3
// let filename: string = process.argv[2];
// console.log('Reading ' + filename);


// // read in file
// // write out to another file temp
// // replace AST of file with: read in temp; eval it 

// var testingMode: boolean = true;
// var safeEvalMode: boolean = false;

// if(fs.lstatSync(filename).isFile()) {
// 	// Debug: putting true as the second argument bypasses package-based inference
// 	stubifyFile(filename, true, testingMode);
// } else if( fs.lstatSync(filename).isDirectory()) {
// 	let filesToRead: string[] = [];
// 	if( process.argv.length == 4) {
// 		filesToRead = fs.readFileSync(process.argv[3], 'utf-8').split("\n");
// 	}
// 	else {
// 		filesToRead = fs.readdirSync(filename);
// 	}
// 	stubifyDirectory(filename, filesToRead, safeEvalMode, testingMode);
// } else {
// 	console.log("Error: input to transformer must be a directory or a file");
// }


// console.log('Done');

export {stubifyFile as fileStubFile}
