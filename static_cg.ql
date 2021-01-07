import javascript
import DataFlow

class StartTrackingCallNode extends InvokeNode {

	StartTrackingCallNode() {
		//this.asExpr().getFile().getAbsolutePath().matches("%.spec.js%") 
		this.asExpr().getFile().getAbsolutePath().matches("%test%") and
		not this.asExpr().getFile().getAbsolutePath().matches("%node_modules%")
	} 
}

string getFunctionID(Function f) {
	result = f.getFile() + ":<" + f.getLocation().getStartLine() + "," + f.getLocation().getStartColumn() + ">--<" 
			 + f.getLocation().getEndLine() + "," + f.getLocation().getEndColumn() + ">"
}

predicate stmtCalls( Stmt s, Function f) {
	exists(DataFlow::InvokeNode invk | invk.asExpr().getEnclosingStmt().getParentStmt*() = s 
			and ( invk.getACallee() = f or fctCalls(invk.getACallee(), f)) 
		)
}

predicate fctCalls( Function caller, Function f) {
	exists(Stmt s | s.getContainer() = caller and stmtCalls(s, f))
}



from StartTrackingCallNode sourceNode, Function called
where stmtCalls( sourceNode.asExpr().getEnclosingStmt(), called)
select "Callee(" + getFunctionID(sourceNode.getACallee()) + ")", "Fun(" + getFunctionID(called) + ")"
