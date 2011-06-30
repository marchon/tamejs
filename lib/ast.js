//
// Copyright (c) 2011 (MIT License)
//    Maxwell Krohn <max@okcupid.com>
//    HumorRainbow, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
//
//-----------------------------------------------------------------------
//
// Code for making the elements of the abstract syntax tree (AST)
// for the tamejs grammar.  Everything should inherit from a Node
// object.  A Program object is output by the parser
//

//-----------------------------------------------------------------------

function Node (startLine) {
    this._label = null;
    this._startLine = startLine;
    this.setLabel = function (x) { this._label = x; }
    this.getLabel = function () { return this._label; }
    this.hasTwaitStatement = function () {
	return false;
    };
    this.toAtom = function () { return null; }
    this.getChildren = function () { return []; }
    this.toExpr = function () { return null; }

    this.compress = function () {
	var v = this.getChildren ();
	for (var i in v) {
	    v[i].compress ();
	}
    };
    
    //----------------------------------------

    this.hasTwaitStatement = function () {
	var v = this.getChildren ();
	for (i in v) {
	    if (v[i].hasTwaitStatement ()) {
		return true;
	    }
	}
	return false;
    };

    //----------------------------------------

    this.passThrough = function (eng) {
	return this.compile (eng);
    };
};

//-----------------------------------------------------------------------

function MyString (startLine, endLine, value) {
    var that = new Node (startLine);
    that._endLine = endLine;
    that._value = value;

    that.dump = function () {
	return { type : "String",
		 value : this._value };
    };
    that.toAtom = function () { 
	var atom = new Atom (this._startLine, this._value);
	atom._endLine = this._endLine;
	return atom;
    };
    return that;
};

//-----------------------------------------------------------------------

function Atom (startLine, value) {
    var that = new Node (startLine);
    that._endLine = startLine;
    that._value = value;

    that.toAtom = function () { return this; }
    that.addAtom = function (a) {
	var spc = "";
	while (this._endLine < a._startLine) {
	    spc += "\n";
	    this._endLine++;
	    
	}
	if (spc.length == 0) { spc = " "; }
	this._value += spc + a._value;
    };

    that.dump = function () {
	return { type : "Atom",
		 lines : [ this._startLine, this._endLine ],
		 value : this._value };
    };

    that.compile = function (eng) {
	var ret = new eng.Output ();
	ret.addLines (this._value.split ("\n"));
	return ret;
    };

    return that;
};

//=======================================================================


function Label (startLine, name) {
    var that = new Node (startLine);
    that._name= name;
    
    that.toAtom = function () {
	return new Atom (this._startLine, this._name);
    };

    that.getName = function () {
	return this._name;
    };

    return that;
};

//=======================================================================

function Expr (atoms) {
    
    // Figure out the start line if it's possible
    var tmp = 0;
    if (atoms.length) {
	tmp = atoms[0]._startLength;
    }
	
    var that = new Node (tmp);
    that._atoms = atoms;
    if (atoms.lengths) {
	this._endLine = atoms[atoms.length - 1]._startLine;
    }

    //-----------------------------------------

    that.getChildren = function () { return this._atoms; }

    //-----------------------------------------

    that.addAtom = function (a) {
	this._atoms.push (a);
    };

    //-----------------------------------------

    that.setLabel = function (x) { 
	this._atoms.unshift (x.toAtom ());
    };

    //-----------------------------------------

    that.dump = function () {
	return { type : "Expr",
		 atoms : this._atoms.map (function (x) { return x.dump (); }) };
    };

    //-----------------------------------------

    that.toExpr = function () { return this; };

    //-----------------------------------------

    //
    // Smush all of the atoms together so that we're dealing with 
    // a list of the form:
    //    
    //    a1 f1 a2 f2 a3 ...
    //  
    that.compress = function () {
	var l = this._atoms.length;
	if (l) {
	    var lastAtom = null;
	    var newAtoms = [];
	    for (var i = 0; i < l; i++) {
		var x = this._atoms[i];
		var a = x.toAtom ();
		if (!a) {
		    // If it's a function, we need to compress it, so 
		    // that its atoms are in the right form
		    x.compress ();
		    newAtoms.push (x);
		    lastAtom = null;
		} else if (!lastAtom) {
		    newAtoms.push (a);
		    lastAtom = a;
		} else {
		    lastAtom.addAtom (a);
		}
	    }
	    this._atoms = newAtoms;
	    this._startLine = newAtoms[0]._startLine;
	    this._endLine = newAtoms[newAtoms.length - 1]._endLine;
	}
    };

    //-----------------------------------------

    that.pushAtomsToArray = function (out) {
	for (var i in this._atoms) {
	    out.push (this._atoms[i]);
	}
    };
    
    //-----------------------------------------

    that.takeAtomsFrom = function (x) {
	this._atoms = this._atoms.concat (x._atoms);
    };

    //-----------------------------------------

    that.compileAtom = function (eng, a) {
	var out;
	if (typeof (a) == 'string') {
	    out = eng.Output ();
	    out.addLine (a);
	} else {
	    out = a.compile (eng);
	}
	return out;
    };

    //-----------------------------------------

    that.compile = function (eng, tailCall, skipFn) {

	var ret;
	
	if (skipFn) {
	    ret = new eng.Output ();
	} else {
	    var fn = eng.fnFresh ();
	    ret = new eng.Output (fn);
	    ret.addLambda (fn);
	}

	for (var i in this._atoms) {
	    var atom = this._atoms[i];
	    var atomc = atom.compile (eng);
	    ret.addOutput (atomc);
	}
	var calls = [];
	if (tailCall) {
	    ret.addOutput (tailCall);
	    calls.push (tailCall.fnName ());
	}
	ret.addCall(calls, skipFn);
	if (!skipFn) {
	    ret.closeLambda ();
	}
	return (ret);
    };

    //-----------------------------------------

    that.passThrough = function (eng) { 
	var out = new eng.Output ();
	for (var i in this._atoms) {
	    var a = this._atoms[i].compile (eng);
	    out.addOutput (a);
	}
	return out;
    };

    //-----------------------------------------

    that.inline = function (eng) {
	var out = new eng.Output ();
	for (var i in this._atoms) {
	    var atom = this._atoms[i];
	    var atomc = atom.compile (eng);
	    out.addOutput (atomc);
	}
	return out.inlineOutput ();
    };

    return that;
};

//=======================================================================

function Block (startLine, body, toplev) {
    var that = new Node (startLine);
    that._body = body;
    that._toplev = toplev;

    //----------------------------------------

    that.getChildren = function () { return this._body; };

    //----------------------------------------

    that.compress = function () {

	var l = 0;
	if (this._body) { l = this._body.length; }
	if (l) {
	    var lastExpr = null;
	    var newBody = [];
	    for (var i = 0; i < l; i++) {
		var e = this._body[i];
		var x = e.toExpr ();
		if (!x) {
		    if (lastExpr) { 
			lastExpr.compress (); 
			lastExpr = null;
		    }
		    e.compress ();
		    newBody.push (e);
		} else {
		    if (lastExpr) {
			lastExpr.takeAtomsFrom (x);
		    } else {
			lastExpr = x;
			newBody.push (x);
		    }
		}
	    }
	    if (lastExpr) { lastExpr.compress (); }
	    this._body = newBody;
	}
    };

    //----------------------------------------

    that.passThrough = function (eng) {
	var ret = new eng.Output ();
	for (var i in this._body) {
	    var s = this._body[i].passThrough (eng);
	    ret.addOutput (s);
	}
	return ret;
    }

    //----------------------------------------

    that.compile = function (eng, tailCall, skipFn) {

	// Optimization -- for empty blocks, just add a call to the 
	// currently active continuation
	if (!this._body || !this._body.length) {
	    return new eng.Output ();
	}

	// Optimization --- don't need to nest if it's a 
	// block with only one statement....
	if (this._body.length == 1) {
	    return this._body[0].compile(eng, tailCall, skipFn);
	} 

	// Another optimization -- no need to nest if we're
	// going to be making a tailCall on the first guy.
	var expr;
	if (this._body.length > 1 && (expr = this._body[0].toExpr ())) {
	    this._body.shift ();
	    var tailCalls = this.compile (eng);
	    var ret = expr.compile (eng, tailCalls);
	    return ret;
	}

	var fn = eng.fnFresh ();
	var ret = new eng.Output (fn);
	ret.addLambda (fn);
	var calls = [];

	while (this._body.length) {
	    var nxt = this._body.shift ();

	    // Another optimization -- only do a nested tail call if
	    // the first item is an expression, and there are more than
	    // 1 items left.  Otherwise, we can do these guys serially.
	    if ((expr = nxt.toExpr ()) && this._body.length) {
		var tailCalls = this.compile (eng);
		var s = nxt.compile (eng, tailCalls);
		ret.addOutput (s);
		calls.push (s.fnName ());

		// The nested tail call does everything recursively
		// so our work at this level is dnoe.
		break;

	    } else {
		var s = nxt.compile (eng);
		ret.addOutput (s);
		calls.push (s.fnName ());
	    }
	}
	ret.addCall (calls);
	ret.closeLambda();
	return ret;
    };

    //----------------------------------------

    that.dump = function () {
	return { type : "Block",
		 statements : this._body.map (function (x) 
					      { return x.dump (); })  };
    };

    //----------------------------------------

    return that;
};

//=======================================================================

function ForStatement (startLine, forIter, body) {
    var that = new Node (startLine);
    that._forIter = forIter;
    that._body = body;

    that.getChildren = function () { return [ this._forIter, this._body ]; };

    that.dump = function () {
	return { type : "ForStatement",
		 iter : this._forIter.dump (),
		 body : this._statement.dump () };
    };

    that.passThrough = function (eng) {
	var ret = new eng.Output ();
	var lbl = "";
	if (this.getLabel ()) {
	    label = this.getLabel () + " : ";
	}
	var iter = this._forIter.passThrough (eng);
	ret.addLine (lbl + " for (" + iter + ") {");
	ret.indent ();
	var body = this._body.passThrough (eng);
	ret.addOutput (body);
	ret.unindent ();
	ret.addLine ("}");
	return ret;
    };

    that.compile = function (eng) {
	var outer = eng.fnFresh ();
	var ret = new eng.Output (outer);
	ret.addLambda (outer);
	var lbl = null;
	if (this.getLabel ()) {
	    lbl = ret.localLabelName (this.getLabel ().getName ());
	    ret.initLocalLabel (lbl);
	}
	var iter = this._forIter.inline (eng);

	ret.addLine (iter[0] + ";"); // initialization
	
	var inner = eng.fnFresh ();
	ret.addLambda (inner);

	var inc = eng.fnFresh ();
	ret.addLambda (inc);
	ret.addLine (iter[2]);
	ret.addCall([inner]);
	ret.closeLambda ();

	ret.addLine ("if (" + iter[1] + ") {");
	ret.indent ();
	var body = this._body.compile (eng);
	ret.addOutput (body);
	ret.addCall([ body.fnName (), inc ]);
	ret.unindent ();
	ret.addLine ("} else {");
	ret.indent ();
	ret.addCall ([]);
	ret.unindent ();
	ret.addLine ("}");

	ret.populateLabels (lbl, inc, ret.genericCont ());
	ret.closeLambda (); // inner
	ret.addCall ([ inner ]);
	ret.closeLambda (); // outer
	return ret;
    };

    return that;
};

//=======================================================================

function ForIterClassic (initExpr, condExpr, incExpr) {
    var that = new Node ();
    that._initExpr = initExpr;
    that._condExpr = condExpr;
    that._incExpr = incExpr;

    that.getChildren = function () 
    { return [ this._initExpr, this._condExpr, this._incExpr ]; };

    that.dump = function () {
	return { type : "ForIterClassic",
		 initExpr : this._initExpr.dump (),
		 condExpr : this._condExpr.dump (),
		 incExpr : this._incExpr.dump () };
    };

    that.passThrough = function (eng) {
	var out = new eng.Output ();
	var a = this._initExpr.passThrough (eng);
	out.addOutput (a); out.addLine (";");
	var b = this._condExpr.passThrough (eng);
	out.addOutput (b); out.addLine (";");
	var c = this._incExpr.passThrough (eng); 
	out.addOutput (c);
	return out.inlineOutput ();
    };

    that.inline = function (eng) {
	var a = this._initExpr.inline (eng);
	var b = this._condExpr.inline (eng);
	var c = this._incExpr.inline (eng);
	return [ a, b, c];
    };

    return that;
};

//=======================================================================

function SwitchStatement (startLine, expr, cases) {
    var that = new Node (startLine);
    that._expr = expr;
    that._cases = cases;

    //-----------------------------------------

    that.getChildren = function () { return this._cases; }

    //-----------------------------------------

    that.dump = function () {
	return { type : "Switch",
		 expr : this._expr.dump (),
		 cases : this._cases.map (function (x) { return x.dump (); })
	       };
    };

    //-----------------------------------------

    that.passThrough = function (eng) {
	var ret = new eng.Output ();
	ret.addLine ("switch (" + this._expr.inline (eng) + ") {");
	ret.indent ();
	for (var i in this._cases) {
	    var c = this._cases[i].passThrough (eng);
	    ret.addOutput (c);
	}
	ret.unindent ();
	ret.addLine ("}");
	return ret;
    };

    //-----------------------------------------

    that.compile = function (eng) {
	var fn = eng.fnFresh ();
	var ret = new eng.Output (fn);
	ret.addLambda (fn);
	var x = "__tame_switch_x";
	ret.addLine ("var " + x + " = " + this._expr.inline (eng) + ";");
	ret.populateLabels (null, null, ret.genericCont ());
	var calls = [];
	for (i in this._cases) {
	    var c = this._cases[i].getBody ().compile (eng);
	    ret.addOutput (c);
	    calls.push (c.fnNameRequired ());
	}
	calls.push (ret.genericCont ());
	var l = "__tame_switch_calls";
	ret.addLine ("var " + l + " = [" + calls.join (", ") + "];");
	var n_open = 0;
	for (i in this._cases) {
	    var c = this._cases[i];
	    var v = c.getValue ();
	    if (v) {
		ret.addLine ("if (" + x + " == " + v + ") {");
		ret.indent ();
	    }
	    ret.addLine (ret.callChain(l));
	    if (v) {
		ret.unindent ();
		ret.addLine ("} else {");
		ret.indent ();
		ret.addLine (l + ".shift();");
		n_open++;
	    }
	}

	while (n_open) {
	    ret.unindent ();
	    ret.addLine ("}");
	    n_open--;
	}
	ret.closeLambda ();
	return ret;
    };

    //-----------------------------------------

    return that;
};

//=======================================================================

function Case (startLine, value) {
    var that = new Node (startLine);
    that._value = value;
    that._body = null;

    //-----------------------------------------

    that.getBody = function () { return this._body; }
    that.getValue = function () { return this._value; }

    //-----------------------------------------

    that.getChildren = function () { return [ that._body ]; };

    //-----------------------------------------

    that.dump = function () {
	return { type : "Case",
		 value : this._value,
		 body : this._body.dump ()
	       };
    };

    //-----------------------------------------

    that.addBody = function (startLine, b) {
	this._body = new Block (startLine, b);
    };

    //-----------------------------------------

    that.outputLabel = function () {
	var out;
	if (this._value) {
	    out = "case " + this._value;
	} else {
	    out = "default";
	}
	out += ":";
	return out;
    };

    //-----------------------------------------

    that.passThrough = function (eng) {
	var ret = new eng.Output ();
	ret.addLine (this.outputLabel ());
	ret.indent ();
	var c = this._body.passThrough (eng);
	ret.addOutput (c);
	ret.unindent ();
	return ret;
    };

    //-----------------------------------------

    return that;
};


//=======================================================================

function IfElseStatement (startLine, condExpr, ifStatement, elseStatement) {
    var that = new Node (startLine);
    that._condExpr = condExpr;
    that._ifStatement = ifStatement;
    if (!elseStatement) { elseStatement = new Block(startLine, []); }
    that._elseStatement = elseStatement;

    //-----------------------------------------

    that.getChildren = function () 
    { return [ this._condExpr, this._ifStatement, this._elseStatement ]; };

    //-----------------------------------------

    that.dump = function () {
	return { type : "IfElseStatement",
		 condExpr : this._condExpr.dump (),
		 ifStatement : this._ifStatement.dump (),
		 elseStatement : this._elseStatement.dump () };
    };

    //-----------------------------------------

    that.compile = function (eng) {
	var fn = eng.fnFresh ();
	var ret = new eng.Output (fn);
	ret.addLambda (fn);
	var ifStatement = this._ifStatement.compile (eng);
	var elseStatement = this._elseStatement.compile (eng);
	var condExpr = this._condExpr.inline (eng);
	ret.addOutput (ifStatement);
	ret.addOutput (elseStatement);
	ret.addLine ("if (" + condExpr + ") {");
	ret.indent ();
	ret.addCall (ifStatement.fnNameList () );
	ret.unindent ();
	ret.addLine ("} else {");
	ret.indent ();
	ret.addCall ( elseStatement.fnNameList () );
	ret.unindent ();
	ret.addLine ("}");
	ret.closeLambda ();
	return ret;
    };

    //-----------------------------------------

    that.passThrough = function (eng) {
	var ret = new eng.Output ();
	var ifStatement = this._ifStatement.passThrough (eng);
	var elseStatement = this._elseStatement.passThrough (eng);
	var condExpr = this._condExpr.inline (eng);
	ret.addLine ("if (" + condExpr + ") {");
	ret.indent ();
	ret.addOutput (ifStatement);
	ret.unindent ();
	ret.addLine ("} else {");
	ret.indent ();
	ret.addOutput (elseStatement);
	ret.unindent ();
	ret.addLine ("}");
	return ret;
    };

    //-----------------------------------------

    return that;
};

//-----------------------------------------------------------------------

function FunctionDeclaration (startLine, name, params, body) {
    var that = new Node (startLine);
    that._name = name;
    that._params = params;
    that._body = body;

    //-----------------------------------------

    that.getChildren = function () { 
	return [ this._body ]; 
    };

    //-----------------------------------------

    // Don't propogate down, since we don't need to tame the
    // surrounding block when the inner block is tamed. 
    that.hasTwaitStatement = function () { return false; };

    //-----------------------------------------

    that.dump = function () {
	return { type : "FunctionDeclaration",
		 name : name,
		 params : params,
		 body : this._body.dump () };
    };

    //-----------------------------------------

    that.compile = function (eng) {

	var ret = new eng.Output ();
	var nm = this._name;
	if (!nm) { nm = ""; }
	var pl = this._params.join (", ");
	ret.addLine ("function " + nm + " (" + pl + ") {");
	ret.indent ();
	var bod;
	if (this._body.hasTwaitStatement ()) {
	    bod = this._body.compile (eng, null, true);
	    ret.addOutput (bod);
	    ret.addCall ([bod.fnName()]);
	} else {
	    bod = this._body.passThrough (eng);
	    ret.addOutput (bod);
	}
	    
	ret.unindent ();
	ret.addLine ("}");
	return ret;
    };

    //-----------------------------------------

    return that;
};

//=======================================================================


function TwaitStatement (startLine, body) {
    var that = new Node (startLine);
    that._body = body;
    that.hasTwaitStatement = function () { return true; };

    //-----------------------------------------

    that.getChildren = function () { return [ this._body ]; };

    //-----------------------------------------

    that.dump = function () {
	return { type : "TwaitStatement",
		 body : this._body.dump () };
    };

    //-----------------------------------------

    that.compile = function (eng) {
	var fn = eng.fnFresh ();
	var ret = new eng.Output (fn);
	ret.addLambda (fn);
	var ev = ret.twaitEv ();
	ret.addLine ("var " + ev + " = new tame.Event (" 
		     + ret.genericCont() +");");
	body = this._body.compile (eng);
	ret.addOutput (body);
	ret.addLine (body.fnName() + "(" + ret.endFn () + ");");
	ret.addLine (ev + ".trigger();");
	ret.closeLambda ();
	return ret;
    };

    //-----------------------------------------

    return that;
};

//=======================================================================

function ContinueStatement (startLine, targetLabel) {  
    var that = new Node (startLine);
    that._targetLabel = targetLabel;
    
    //-----------------------------------------

    that.dump = function () {
	return { type : "ContinueStatement",
		 targetLabel : targetLabel };
    };

    //-----------------------------------------

    that.compile = function (eng) {
	var fn = eng.fnFresh ();
	var ret = new eng.Output (fn);
	ret.addLambda (fn);
	ret.callLabel (targetLabel, ret.kContinue());
	ret.closeLambda ();
	return ret;
    };

    //-----------------------------------------

    return that;
};

//=======================================================================

function BreakStatement (startLine, targetLabel) {
    var that = new Node (startLine);
    that._targetLabel = targetLabel;
    
    //-----------------------------------------

    that.dump = function () {
	return { type : "BreakStatement",
		 targetLabel : targetLabel };
    };

    //-----------------------------------------

    that.passThrough = function (eng) {
	var ret = new eng.Output ();
	var lbl = "";
	if (this._targetLabel) { lbl = this._targetLabel; }
	ret.addLine ("break " + lbl + ";");
	return ret;
    };

    //-----------------------------------------

    that.compile = function (eng) {
	var fn = eng.fnFresh ();
	var ret = new eng.Output (fn);
	ret.addLambda (fn);
	ret.callLabel (targetLabel, ret.kBreak ());
	ret.closeLambda ();
	return ret;
    };

    //-----------------------------------------

    return that;
};

//=======================================================================

function WhileStatement (startLine, condExpr, body) {
    var that = new Node (startLine);
    that._condExpr = condExpr;
    that._body = body;

    //-----------------------------------------

    that.getChildren = function () { return [ this._condExpr, this._body ]; };

    //-----------------------------------------

    that.compile = function (eng) {
	var outer = eng.fnFresh ();
	var ret = new eng.Output (outer);
	ret.addLambda (outer);
	var lbl = null;
	if (this.getLabel ()) {
	    lbl = ret.localLabelName (this.getLabel ().getName ());
	    ret.initLocalLabel (lbl);
	}
	var inner = eng.fnFresh ();
	ret.addLambda (inner);
	var condExpr = this._condExpr.inline (eng);
	ret.addLine ("if (" + condExpr + ") {");
	ret.indent ();

	var body = this._body.compile (eng);
	ret.addOutput (body);
	ret.addCall ([ body.fnName (), inner ]);

	ret.unindent ();
	ret.addLine ("} else {");

	ret.indent ();
	ret.addCall ([]);

	ret.unindent ();
	ret.addLine ("}");

	ret.closeLambda (); // inner
	ret.populateLabels (lbl, inner, ret.genericCont ());
	ret.addCall ([inner]);
	ret.closeLambda (); // outer
	return ret;
    };

    //-----------------------------------------

    that.passThrough = function (eng) {
	var ret = new eng.Output ();
	var lbl = "";
	if (this.getLabel ()) {
	    label = this.getLabel () + " : ";
	}
	var condExpr = this._condExpr.inline (eng);
	ret.addLine (lbl + "while (" + condExpr + ") {");
	ret.indent ();
	var body = this._body.passThrough (eng);
	ret.addOutput (body);
	ret.unindent ();
	ret.addLine ("}");
	return ret;
    };


    //-----------------------------------------

    that.dump = function () {
	return { type : "WhileStatement",
		 condExpr : this._condExpr.dump (),
		 body : this._body.dump () };
    };
		 
    //-----------------------------------------

    return that;
};

//-----------------------------------------------------------------------

function ReturnStatement (startLine, expr) {
    var that = new Node (startLine);
    that._expr = expr;

    //-----------------------------------------

    that.getChildren = function () { return [ this._expr ]; } ; 

    //-----------------------------------------

    that.dump = function () {
	return { type : "ReturnStatement",
		 expr : this._expr.dump () };
    };

    //-----------------------------------------

    that.passThrough = function (eng) {
	var ret = new eng.Output ();
	var expr = this._expr
	ret.addLine ("return " + expr.inline (eng) + ";");
	return ret;
    };

    //-----------------------------------------

    that.compile = function (eng, tailCall, skipFn) {
	var ret = new eng.Output (eng.endFn ());
	return ret;
    };

    return that;
};

//-----------------------------------------------------------------------

function Program (statements) {
    var that = new Node (1);
    that._body = new Block (1, statements, true);

    that.getChildren = function () { return [ this._body ]; };

    //-----------------------------------------

    that.dump = function () {
	return { body : this._body.dump () };
    };

    //-----------------------------------------

    that.compile = function (eng) {
	var out = new eng.Output (null, 1);

	// Need the runtime
	out.addLine ("var tame = require('./tame').tame;");
	var body = this._body.compile (eng);
	out.addOutput (body);
	out.addLine (body.fnName() + " (" + out.endFn() + ");");
	return out;
    };

    //-----------------------------------------

    return that;
};

//-----------------------------------------------------------------------

exports.Program = Program;
exports.WhileStatement = WhileStatement;
exports.IfElseStatement = IfElseStatement;
exports.Expr = Expr;
exports.Block = Block;
exports.TwaitStatement = TwaitStatement;
exports.ForStatement = ForStatement;
exports.FunctionDeclaration = FunctionDeclaration;
exports.ReturnStatement = ReturnStatement;
exports.Atom = Atom;
exports.Label = Label;
exports.String = MyString;
exports.BreakStatement = BreakStatement;
exports.ContinueStatement = ContinueStatement;
exports.ForIterClassic = ForIterClassic;
exports.Case = Case;
exports.SwitchStatement = SwitchStatement;
