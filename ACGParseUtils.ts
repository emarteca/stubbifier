
import * as fs from 'fs';
import * as babel from '@babel/types';

/*
    Get an appropriate name from the UID. Appropriate for both variable
    and file names.
*/
export function buildHappyName(sad : string) {
    let happyName = "";

    /* sanitize sad */
    sad = sad.replace(/\./g, 'dot').replace(/-/g, 'dash');

    /* take: acorn/src/location.js:<12,11>--<18,1>
       make: acorn_src_location_12_11_18_1 
    */
    let split : string[] = sad.split(/.js:<|.ts:</);
    if (split.length < 2) {
        return sad;
    }

    // Do first part: acorn_src_location_
    happyName += split[0].replace(/\//g, '_') + '_';

    // Do row cols: 12_11_18_1
    happyName += split[1].substring(0, split[1].length - 1).replace(/,/g, '_').replace('>dashdash<', '_');

    return happyName;
}


/* Adjust the LOC (from the ACG, from QL) to match Babel. 
   Code documented by example, see below. */
function adjustLOC(locAsString : string) : string {
    /* Fun(/opt/src/acorn/src/location.js:<12,12>--<18,1>) 
       want
       acorn/src/location.js:<12,11>--<18,1>

       note the -1 on the first column
    */ 

    /* get /opt/src/acorn/src/location.js:<12,12>--<18,1> */
    let adjustedLOC = locAsString.substring(4, locAsString.length - 1);

    /* trim up to package root (by removing /opt/src/) 
       get acorn/src/location.js:<12,12>--<18,1> */
    // adjustedLOC = adjustedLOC.substring("/opt/src/".length, adjustedLOC.length);

    /* adjust column number
       get acorn/src/location.js:<12,11>--<18,1> */
    let firstIndex = adjustedLOC.indexOf(":<") + ":<".length;
    let secondIndex = adjustedLOC.indexOf(">--<");
    let firstRowCol : string[] = adjustedLOC.substring(firstIndex, secondIndex).split(',');
    firstRowCol[1] = String(Number(firstRowCol[1]) - 1);
    adjustedLOC = adjustedLOC.substring(0, firstIndex) + firstRowCol[0] + ',' + firstRowCol[1] +
                  adjustedLOC.substring(secondIndex);

    return adjustedLOC;
}

/*
    Parse an Approximate Call Graph (ACG) .csv file, and produce a string[] with
    file and source information for calls which the ACG picked up on.

    Note: You may want to cross-reference this list with a list of callable functions, probably.
*/
export function getTargetsFromACG(filepath : string) : string[] {
    let unprocessedCG : string[] = fs.readFileSync(filepath, 'utf-8').split('\n');

    /* remove header */
    unprocessedCG.shift();
   
    let targets : string[] = unprocessedCG.map((line : string) => {
        line = line.substr(1, line.length - 2);
        let target = line.split('\",\"')[1];

        if (!target || target.substr(0, 3) != 'Fun') {
            return "";
        }

        return adjustLOC(target);
    })

    let partialRet : string[] = targets.filter((line : string) => {
        return line != "";
    });

    /*
    let mapObj = {};

    // construct return map
    partialRet.forEach(s => {
        mapObj[s] = "";
    });

    return new Map(Object.entries(mapObj));
    */

    return partialRet;
}

function getUncoveredFunctions(pathToCoverageReport : string) : string[] {
    const coverage = require(pathToCoverageReport);
    const calledFunctions = [];
    const uncalledFunctions = [];
    Object.keys(coverage).forEach((fileName) => {
        Object.keys(coverage[fileName].fnMap).forEach((key) => {
            if(coverage[fileName].f[key] > 0) {
                const loc = coverage[fileName].fnMap[key].loc;
                calledFunctions.push(
                    `${fileName}:<${loc.start.line},${loc.start.column}>--<${loc.end.line},${loc.end.column}>`
                )
            } else {
                const loc = coverage[fileName].fnMap[key].loc;
                uncalledFunctions.push(
                    `${fileName}:<${loc.start.line},${loc.start.column}>--<${loc.end.line},${loc.end.column}>`
                )
            }
        });
    });
    // console.log(calledFunctions);
    // console.log(uncalledFunctions);
    return calledFunctions;
}

/*
[
  'Fun(/Users/Alexi/Documents/Projects/JSTransformationBenchmarks/razorpay-node/distrazorpay.js:<16,11>--<19,5>)',
  ...
]
*/
export function getTargetsFromCoverageReport(filepath : string) : string[] {
    let uncoveredFunctions : string[] = getUncoveredFunctions(filepath);

    return uncoveredFunctions;
}

export function getFileName(target: string): string {
    return target.split(":")[0];
}

export function buildEvalCheck( callExpNode: babel.CallExpression, inAsyncFct: boolean, filename: string): babel.CallExpression {
    // if ( callee === eval ) { console.warn("BTW dangerous call"); }
    // "let dangerousFunctions = [eval, process.exec];"

    // ( () => let tempExp__uniqID = callee; if( tempExp__uniqID === eval) { console.warn("uh oh"); } return tempExp__uniqID; )()

    let tempVarID: babel.Identifier = babel.identifier("tempExp__uniqID");
    let tempVarDecl: babel.VariableDeclaration = babel.variableDeclaration("let", [babel.variableDeclarator(tempVarID, <any>callExpNode.callee)]);
    let tempVarDecls : babel.Statement[] = [tempVarDecl];
    if (callExpNode.callee.type == "MemberExpression" && ( callExpNode.callee.property.type == "Identifier" || callExpNode.callee.property.type == "PrivateName")) {
        // If it's a memberExpression, we want to save the receiver.
        let tempReceiverID: babel.Identifier = babel.identifier("tempEXP__rec__uniqID");
        let tempReceiver = babel.variableDeclaration("let", [babel.variableDeclarator(tempReceiverID, callExpNode.callee.object)]);
        // callee.bind(callee.object)
        let tempBindCall: babel.CallExpression = babel.callExpression( babel.memberExpression(babel.memberExpression(tempReceiverID, callExpNode.callee.property, callExpNode.callee.computed), 
                                                        babel.identifier("bind")),
                                                        [tempReceiverID]);
        (<any>tempBindCall).isNewCallExp = true;
        tempVarDecl = babel.variableDeclaration("let", [babel.variableDeclarator(tempVarID, tempBindCall)]);
        tempVarDecls = [tempReceiver, tempVarDecl];
    }

    let intermCallExp: babel.CallExpression = babel.callExpression( 
                    babel.memberExpression(
                        babel.identifier("dangerousFunctions"),
                        babel.identifier("indexOf")
                    ), 
                    [ tempVarID]
                );
    (<any>intermCallExp).isNewCallExp = true;

    let test = babel.binaryExpression( ">", 
                intermCallExp,
                babel.numericLiteral(-1)
    );

    let consequent: babel.Statement = babel.expressionStatement( babel.callExpression( 
        babel.memberExpression(
            babel.identifier("console"),
            babel.identifier("warn")
        ), 
        [ babel.stringLiteral("[STUBBIFIER METRICS] WARNING: Dangerous call in expanded stub, in file: " + filename)]
    ));
    (<any>consequent.expression).isNewCallExp = true;

    let ifCheckStmt: babel.IfStatement = babel.ifStatement( test, consequent);
    let retCallExp: babel.CallExpression = babel.callExpression(<any>callExpNode.callee/*tempVarID*/, callExpNode.arguments);
    (<any> retCallExp).isNewCallExp = true;
    let returnStmt: babel.ReturnStatement = babel.returnStatement( retCallExp);

    let arrowFunc: babel.ArrowFunctionExpression = babel.arrowFunctionExpression( [], // params
                                                                    babel.blockStatement(tempVarDecls.concat([ifCheckStmt, returnStmt])),
                                                                    inAsyncFct) // whether or not it should be async
    return babel.callExpression( arrowFunc, []);
}