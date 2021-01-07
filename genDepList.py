import sys
import os 
import subprocess
import json

def run_command( command, timeout=None):
	try:
		process = subprocess.run( command.split(), stdout=subprocess.PIPE, stdin=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
	except subprocess.TimeoutExpired:
		error_string = "TIMEOUT ERROR: for user-specified timeout " + str(timeout) + " seconds"
		error = "TIMEOUT ERROR"
		return( error.encode('utf-8'), error_string.encode('utf-8'), 1) # non-zero return code
	return( process.stderr, process.stdout, process.returncode)

def get_dependencies( pkg_json, manager):
	if pkg_json["devDependencies"]:
		run_command( "rm -r node_modules")
		run_command( "mv package.json TEMP_package.json_TEMP")
		dev_deps = pkg_json["devDependencies"]
		pkg_json["devDependencies"] = {}
		with open("package.json", 'w') as f:
			json.dump( pkg_json, f)
		run_command( manager + (" install" if manager == "npm run " else ""))
		pkg_json["devDependencies"] = dev_deps
	# get the list of deps, excluding hidden directories
	deps = [d for d in os.listdir("node_modules") if not d[0] == "."] 
	# then, reset the deps (if required)
	if pkg_json["devDependencies"]:
		run_command( "rm -r node_modules")
		run_command( "mv TEMP_package.json_TEMP package.json")
		run_command( manager + (" install" if manager == "npm run " else ""))
	return( deps)

if len( sys.argv) != 3:
	print( "Usage: python3 genDepList.py proj_dir install_manager")

proj_dir = sys.argv[ 1]
cur_dir = os.getcwd()
manager = sys.argv[ 2]
with open(proj_dir + "/package.json") as f:
	pkg_json = json.load(f)

output_file = open(proj_dir + "/dep_list.txt", 'w')
os.chdir( proj_dir)
dep_output = get_dependencies(pkg_json, manager) 
os.chdir( cur_dir)
output_file.write("\n".join(dep_output))
output_file.close()
# print(get_file_contents(dep_list_file))
