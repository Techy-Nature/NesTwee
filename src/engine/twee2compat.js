'use strict';
/*
	Twee2 header compatibility: converts `:: Name [tags] <x,y>` into Twee 3's
	`:: Name [tags] {"position":"x,y"}`.

	Ported from Tweego's internal/twee2compat
	Copyright © 2014–2019 Thomas Michael Edwards. Simplified BSD License.
*/

const detectRe = /^:: *[^[\n]*?(?: *\[.*?\])? *<(.*?)> *$/m;
const headerRe = /^(:: *[^[\n]*?)( *\[.*?\])?(?: *<(.*?)>)? *$/gm;
const badPosRe = /^(::.*?) *\{"position":" *"\}$/gm;

function hasTwee2Syntax(s) {
	return detectRe.test(s);
}

function toV3(s) {
	if (!hasTwee2Syntax(s)) return s;
	s = s.replace(headerRe, (_m, a, b, c) => `${a}${b || ''} {"position":"${c || ''}"}`);
	s = s.replace(badPosRe, '$1');
	return s;
}

module.exports = { toV3, hasTwee2Syntax };
