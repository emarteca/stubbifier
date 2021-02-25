import sys 
import pandas as pd 
import numpy as np 
import os

REL_TIME = "real"

def get_seconds( s):
	mins = float(s.split("m")[0])
	secs = float(s.split("m")[1].split("s")[0])
	return( mins*60 + secs)

def get_mean_time( filename):
	try:
		df = pd.read_csv( filename, sep="\t", header=None)
		df.columns = ["type", "time"]
		df["time"] = df.time.apply(lambda s: get_seconds(s)) 
		return( df[df.type == "real"].time.mean())
	except:
		return np.nan

def zero_size_if_not_found( filename):
	size = 0
	try:
		size = os.path.getsize( filename)
	except:
		print("File not found, returning zero size: " + filename)
	return( size)

def get_file_list_size( filenames):
	return( sum([zero_size_if_not_found(f) for f in filenames]))

def get_file_for_fct( fct_entry):
	name_comps = fct_entry.split(" --- ")
	try:
		return( name_comps[1] + ".dir/" + name_comps[0] + ".BIGG")
	except:
		print("Format error, does not specify fct file: " + fct_entry)
		return( "")

def get_num_fcts_files_size( row, num_runs):
	filename = "tests_" + row.project + "_" + str(num_runs) + "runs.out"
	uniq_files = get_unique_metrics_expanded( filename, "FILE STUB HAS BEEN EXPANDED")
	exp_file_size = get_file_list_size( uniq_files)
	uniq_fcts = get_unique_metrics_expanded( filename, "FUNCTION STUB HAS BEEN EXPANDED")
	exp_fct_size = get_file_list_size( [get_file_for_fct(fct) for fct in uniq_fcts])
	row["files_exp"] = len(uniq_files)
	row["fcts_exp"] = len(uniq_fcts)
	row["size_exp_KB"] = (exp_fct_size + exp_file_size)/1000 # converting to KB
	return( row)

def get_unique_metrics_expanded( filename, metric):
	fs = []
	try:
		with open( filename,"r") as fi:
			for ln in fi:
				cont = ln.split(metric + ": ")
				if len(cont) == 2:
					fs += [cont[1].split("\n")[0]]
	except:
		print("File not found, returning zero metrics: " + filename)
	return( list( set( fs)))


def printDFToFile( df, filename):
	f = open(filename, 'w');
	f.write(df.to_csv(index = False))
	f.close()


if len( sys.argv) < 3:
	print("Usage: python3 processData.py project_name num_runs [data_dir]")
else:
	project_name = sys.argv[1]
	num_runs = sys.argv[2]
	data_dir = "." if len(sys.argv) < 4 else sys.argv[3]
	curdir = os.getcwd()
	os.chdir(data_dir)
	all_files = [f for f in os.listdir() if f.find(project_name) > -1]
	ret_frame = pd.DataFrame([project_name], columns=["project"])
	ret_frame["time"] = ret_frame.project.apply( lambda c: get_mean_time("time_" + c + "_" + num_runs + "runs.out"))
	ret_frame.dropna(inplace=True)
	ret_frame = ret_frame.apply( get_num_fcts_files_size, args=(num_runs,), axis=1)
	print(ret_frame)
	printDFToFile( ret_frame, project_name + "_processed_data.csv")
	os.chdir(curdir)
