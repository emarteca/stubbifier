var fs = require('fs');
var tar = require('tar');
var path = require('path');

class Stubbifier {
    constructor(filePath, testingMode = false) {
        this.filePath = filePath;
        this.stubMap = new Map();
        this.testingMode = testingMode;
    }

    copyFunctionProperties (source, dest) {
        // copy the associated properties
        try {
            if (!source || source === null) {
                throw new Error('source is not defined for ' + dest);
            }
            for (var prop in source) {
                dest[prop] = source[prop];
            }
            Object.keys(source).forEach(function (key) {
                dest[key] = source[key];
            });
            dest.prototype = source.prototype;
        }
        catch (error) {
            // console.error('[copyFunctionProperties] ' + error);
            // console.error('Error in: ' + this.filePath);
        }
        return dest;
    }

    getStub(functionName) {
        return this.stubMap.get(functionName);
    }

    setStub(functionName, evaledFunString) {
        this.stubMap.set(functionName, evaledFunString);
    }

    getCode(searchName) {
        if (!fs.existsSync(this.filePath + '.dir')) {
            tar.x({
                file: this.filePath + '.dir' + '.tgz',
                sync: true,
                cwd: path.dirname(this.filePath)
            }); // , [this.filePath + '.dir' + '.tgz']);
        }
        if( this.testingMode) {
            console.log("[STUBBIFIER METRICS] FUNCTION STUB HAS BEEN EXPANDED: " + searchName + " --- " + this.filePath);
        }
        var filename = this.filePath + ".dir/" + searchName + ".BIGG";
        return fs.readFileSync(filename, 'utf-8');
    }
}
module.exports = Stubbifier;
