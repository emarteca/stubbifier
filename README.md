# stubbifier

Tired of shipping huge JS applications?
Look no further than `stubbifier`, a new package for debloating your JS applications!

## Setup and Build

First clone this repo.
Make sure you have docker installed.

Then, from the root of the repo, you can build and run the docker image.

To build the docker image: `docker build -t stubbifier . `

To run it: `./runDocker.sh`

Now, you'll be in the `/home/stubbifier` directory of the docker image.


## Usage 

In the /home/stubbifier directory of the docker image, the steps to use `stubbifier` are as follows:
1. Clone the project you want to debloat
2. Generate a callgraph for this project (based on its own tests)
3. Run `stubbifier` on the project!

Example uses (of applying `stubbifier` to some projects from our evaluation in the associated paper) are included below as a guide.

### Example uses

Here are some annotated examples of applying `stubbifier` to some JavaScript applications (taken from the evaluation in the associated paper).

#### `redux`
To run `stubbifier` with the dynamic callgraph analysis on [`redux`](https://github.com/reduxjs/redux), use the following commands (from `/home/stubbifier` in the docker image).
```
git clone https://github.com/reduxjs/redux Playground/redux
# install dependencies, and run the build script if necessary (this depends on the project being tested)
# note: if the project uses yarn, you'll need to change resetProject.sh to reflect this
./resetProject.sh Playground/redux

# generate deps (redux is built using npm, for yarn-based projects pass "yarn " instead)
python genDepList.py Playground/redux/ "npm install "
# generate .nycrc
python genNycRc.py Playground/redux/ Playground/redux/dep_list.txt

# get dynamic CG: we're using the coverage information
cd Playground/redux
# looking in the redux package.json "npm run test" is the test command for this package
nyc npm run test 
cd ../..

# now, we can run the stubbifier
# note that this assumes you've already generated the dep_list and coverage info above
# also note: the final argument to transform is specifying the guarded execution mode (i.e. eval checking)
# if this argument is not specified, it defaults to true
# passing "false" here means to *not* run in guarded execution mode
./transform.sh Playground/redux "dynamic" false

```
Now `redux` has been stubbed.

Running the tool with the static callgraph analysis is quite similar.
```
# if you want to reuse the same project without recloning it, just reset it first:
./resetProject.sh Playground/redux

# generate deps (skip this step if you ran the dynamic analysis already)
python genDepList.py Playground/redux/ "npm install "

# generate static callgraph
# this will take longer at first since it is running QL and must build the database
./genStaticCG.sh Playground/redux redux

# now, we can run the stubbifier
# note that this assumes you've already generated the dep_list and the static callgraph above
./transform.sh Playground/redux "static" false
```

#### `serve-static`
Applying the tool to [`serve-static`](https://github.com/expressjs/serve-static) is almost the same; the only differences are in the name and repo being transformed.

```
git clone https://github.com/expressjs/serve-static Playground/serve-static
./resetProject.sh Playground/serve-static

python genDepList.py Playground/serve-static/ "npm install "

# setup and run stubbifier with the dynamic call graph analysis
python genNycRc.py Playground/serve-static/ Playground/serve-static/dep_list.txt

cd Playground/serve-static
# looking in the serve-static package.json "npm run test" is the test command for this package
nyc npm run test 
cd ../..

# here, as a demonstrative example, we are calling the transformer without
# the guarded execution mode argument (so it's defaulting to true)
./transform.sh Playground/serve-static "dynamic"

# then, reset serve-static 
# and set up and run stubbifier with the static call graph analysis
./resetProject.sh Playground/serve-static 

./genStaticCG.sh Playground/serve-static serve-static 

./transform.sh Playground/serve-static "static"
```

#### Remove Functions in `serve-static`

Stubbifier also supports a `--removeFuns <>` option, allowing users to specify a set of functions that should be totally removed from an application.
The format of the file should match the format of the static callgraph; thus, we illustrate this functionality with `serve-static` using the static CG:

```
./resetProject.sh Playground/serve-static

# If you haven't already: ./genStaticCG.sh Playground/serve-static serve-static 

# 
./remove.sh Playground/serve-static "static"
```

This should (1) remove all functions detected with the static call graph, and stub the rest. 
If you look at, e.g., index.js (`vim Playground/serve-static/index.js`), you should see a mix of removed functions and stubbed functions.

### Integration with bundlers
We also support integration with `rollup`, a popular JavaScript bundler.
`bundler_mode` is another mode of `stubbifier` execution, with options:
* `"no"`: no application of `rollup` at all; this is the default
* `"only_bundle"`: bundle the application but do not stubbify it
* `"bundle_and_stub"`: bundle the application, and then stubbify the bundle

Note that our automated application of `rollup` generates a general `rollup` configuration file.
If the application is not designed to be bundled this may not produce a functioning bundle (for example, if the project contains dependencies that are not compatible with `rollup`).

Note also that running the application's test suite will not execute the bundle, since the test suite is not configured to work with the bundle.


Example of bundler usage, using `serve-static` again:
```
# first reset the serve-static project
./resetProject.sh Playground/serve-static

# now, transform with bundler mode "bundle_and_stub", and guarded execution mode as false
./transform.sh Playground/serve-static "dynamic" false "bundle_and_stub"
```
The stubbed bundle is now the new file `Playground/serve-static/stubbifyBundle.js`.

To interact with the bundle, you can load it into `node` and see it is the same as the unbundled/unstubbed `serve-static` package.
```
cd Playground/serve-static

node
> let ss_bundle = require('./stubbifyBundle.js');
[STUBBIFIER METRICS] FUNCTION STUB HAS BEEN EXPANDED: ... # some stubs will be expanded
> ss_bundle
# [redacted] large object printed, with the last fields being:
        'video/x-ms-vob': 'vob',
        'video/x-ms-wm': 'wm',
        'video/x-ms-wmv': 'wmv',
        'video/x-ms-wmx': 'wmx',
        'video/x-ms-wvx': 'wvx',
        'video/x-msvideo': 'avi',
        'video/x-sgi-movie': 'movie',
        'video/x-smv': 'smv',
        'x-conference/x-cooltalk': 'ice' },
     default_type: 'application/octet-stream',
     Mime: [Function: Mime],
     charsets: { lookup: [Function: lookup] } } }
>
>
> # if you want to compare to the original (i.e., unbundled and unstubbed) serve-static
> let ss_orig = require('./index.js.original');
> ss_orig
# [redacted] same large object printed, with the same last fields as the bundle
```

### Computing code size (how much was debloated?)
To determine the size reduction due to running `stubbifier` on `redux`, run the following command before and after applying the stubbifier and compare the sizes.
```
# after computing the dependencies 
node getCodeSize.js --to_measure_size Playground/redux/ --dependencies Playground/redux/dep_list.txt

```
With today (January 20, 2021)'s master clone of `redux` and its installed dependencies, we get the following sizes:
* Before stubbifying: 266943 bytes
* After stubbifying with the dynamic callgraph: 189900 bytes


Similarly, for `serve-static`:
```
# after computing the dependencies 
node getCodeSize.js --to_measure_size Playground/serve-static/ --dependencies Playground/serve-static/dep_list.txt

```
With today (January 20, 2021)'s master clone of `serve-static` and its installed dependencies, we get the following sizes:
* Before stubbifying: 106267 bytes
* After stubbifying with the dynamic callgraph: 92824 bytes

### Manual intervention: specifying functions to *not* stub
Users might want to avoid some functions ever being stubbed, independent of the results of the callgraph.
To avoid a function ever being stubbed, add the following line of code as the **first** line in the function in question: `eval("STUBBIFIER_DONT_STUB_ME");`.

For example, given a function
```
function dontStubMe() { 
  console.log("hello");
  // ...
}
```

To specify this function should never be stubbed, rewrite it as:
```
function dontStubMe() { 
  eval("STUBBIFIER_DONT_STUB_ME");
  console.log("hello");
  // ...
}
```

## Running outside docker

Of course, this can be used outside the docker container provided.
To do this, you'll need to 
1. clone this repo
2. npm install (to install our dependencies)
3. npm run build (to compile the typescript)

More involved work: you'll need to make sure you have all the tools we rely on.
You'll also need to properly set up codeql, and replace the module definition with the one we provide.

To do this, just follow the installations specified in the `Dockerfile`, and in `build.sh`.



