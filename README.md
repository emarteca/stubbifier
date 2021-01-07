# stubbifier

Tired of shipping huge JS applications?
Look no further than `stubbifier`, a new package for debloating your JS applications!

## Setup and Build

First clone this repo.
Make sure you have docker installed.

Then, you'll need to download `codeql-linux64.zip` from the [latest codeql CLI releases](https://github.com/github/codeql-cli-binaries/releases).
Place this in the root directory of this repo.

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
./transform.sh Playground/redux "dynamic"

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
./transform.sh Playground/redux "static"
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

./transform.sh Playground/serve-static "dynamic"

# then, reset serve-static 
# and set up and run stubbifier with the static call graph analysis
./resetProject.sh Playground/serve-static 

./genStaticCG.sh Playground/serve-static serve-static 

./transform.sh Playground/serve-static "static"
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



