import sys

# {
#   "reporter": [
#     "json", "text"
#   ],
#   "excludeNodeModules": false,
#   "all": true,
#   "include": [
#     "dist/**",
#     "lib/**",
#     "node_modules/**"
#   ]
# }


def get_file_start():
	return( """{
  "reporter": [
    "json", "text"
  ],
  "excludeNodeModules": false,
  "all": true,
  "include": [
    "dist/**",
    "lib/**",
    "src/**\"""")

def get_file_end():
	return("\n  ]\n}")

def get_nodemod_list( dep_list_file):
	match_list = []
	start_line = "\"node_modules/"
	end_line = "/**\""
	file = open(dep_list_file, 'r')
	file_contents = filter( lambda dep: len(dep) > 0, file.read().split("\n"))
	file.close()
	for dep in file_contents:
		# if len(dep) > 0:
		match_list += [ start_line + dep + end_line]
	return(match_list)

def get_file_contents( dep_list_file):
	file_conts = get_file_start()
	nodemod_list = get_nodemod_list( dep_list_file)
	if len(nodemod_list) > 0:
		file_conts += ",\n    "
		file_conts += ",\n    ".join(nodemod_list)
	file_conts += get_file_end();
	return( file_conts)


if len( sys.argv) != 3:
	print( "Usage: python3 geyNycRc.py proj_dir list_of_deps")

dep_list_file = sys.argv[ 2]
proj_dir = sys.argv[ 1]

output_file = open(proj_dir + "/.nycrc", 'w')
output_file.write(get_file_contents(dep_list_file))
output_file.close()
# print(get_file_contents(dep_list_file))