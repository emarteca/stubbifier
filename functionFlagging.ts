import * as fs from "fs";
import {parse} from '@babel/parser';
import { default as generate } from '@babel/generator';
import {transformFromAstSync} from '@babel/core';
import * as babel from '@babel/types';

import {getTargetsFromACG, buildHappyName, buildEvalCheck, getFileName} from './ACGParseUtils.js';

const MIN_FCT_STUB_LENGTH = 5; // only stub functions that are > 5 lines long


// transform the function if: 
// the list of functions to stub is empty (this defaults to the entire set of top level functions in the file -- TODO probably only DEBUG MODE)
// or, if the function name is in the list
// TODO deal with scoping
function shouldTransformFunction(fctName : string, reachableFuns:string[]): boolean {
	let fctNotInList: boolean = (reachableFuns.indexOf(fctName) == -1);
	return fctNotInList;
	// Trying to reverse the logic.
	// return uncoveredMode? ! fctNotInList : fctNotInList;
}


function getNumLinesSpannedByNode( n: babel.Node): number {
	return n.loc.end.line - n.loc.start.line;
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

// generated with babeljs_gen_gen
function get_stub_flag(): babel.ExpressionStatement {
	let node_map = {};
	node_map["new_StringLiteral_4"] = (<babel.StringLiteral> (<any> {
	  type: "StringLiteral",
	  value: "STUB_FLAG_STUB_THIS_STUB_FCT"
	}));
	node_map["new_Identifier_3"] = (<babel.Identifier> (<any> {
	  type: "Identifier",
	  name: "eval"
	}));
	node_map["new_CallExpression_2"] = (<babel.CallExpression> (<any> {
	  type: "CallExpression",
	  callee: node_map["new_Identifier_3"],
	  arguments: Array(node_map["new_StringLiteral_4"])
	}));
	node_map["new_ExpressionStatement_1"] = (<babel.ExpressionStatement> (<any> {
	  type: "ExpressionStatement",
	  expression: node_map["new_CallExpression_2"]
	}));
	return node_map["new_ExpressionStatement_1"];
}

/*
	processAST: do it
*/
function processASTForFlagging(ast: babel.Program, reachableFuns : string[], filename: string, uncoveredMode: boolean) : babel.Program { 

	// let funcMap : Map<string, [babel.Identifier[], babel.BlockStatement]> = new Map();
	let supportedFunctionNodes : string[] = [
		"FunctionExpression", 
		"FunctionDeclaration", 
		"ArrowFunctionExpression", 
		"ClassMethod",
		"ObjectMethod",
	];


	let output = transformFromAstSync( ast, null, { ast: true, plugins : [ function processASTForFlagging() { return { visitor: {
		Function(path) {
			// let inFunction: boolean = path.findParent((path) => path.isFunction());
			if ( supportedFunctionNodes.indexOf(path.node.type) > -1  /*&& ! inFunction*/ && getNumLinesSpannedByNode(path.node) > MIN_FCT_STUB_LENGTH) {
				// let functionUIDName = "global::" + path.node.id.name;
				let functionUIDName = generateNodeUID(path.node, filename, uncoveredMode);
				// don't forget to write out function body before we replace
				if( shouldTransformFunction(functionUIDName, reachableFuns)) {
					// console.log("Triggered stubbification.");
					if (path.node.kind == "constructor" || path.node.generator || path.node.async) { // TODO broken for generators 
						path.skip(); // don't transform a constructor or anything in a constructor (stubs dont work with "super" and "this")
					} else {
						let flaggedParent = path.findParent((path) => (<any>path.node).isFlagged);
						if (!flaggedParent){
							let flaggingStmt: babel.ExpressionStatement = get_stub_flag();
							path.node.body.body = [flaggingStmt].concat(path.node.body.body);
							(<any> path.node).isFlagged = true;
						}
					}
				}	
			}
		},
	}}}]});


	return output.ast;
}


function flagFunctionForStubbing(filename: string, stubspath: string, reachableFuns : string[], uncoveredMode: boolean) {

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
	ast = processASTForFlagging(ast, reachableFuns, filename, uncoveredMode);

	// console.log(generate(ast).code)
	// write out the stub, overwriting the old file
	fs.writeFileSync( filename, generate(ast).code);
}

export { flagFunctionForStubbing }
