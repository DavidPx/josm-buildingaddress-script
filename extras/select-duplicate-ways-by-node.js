/*
    Finds ways whose nodes have the "Mixed type duplicated nodes" error

    Lets you perform a custom selection for batch updates within JOSM
*/

import josm from 'josm'
import * as console from 'josm/scriptingconsole'
import { DataSetUtil } from 'josm/ds'

const DupeNodesTest = Java.type('org.openstreetmap.josm.data.validation.tests.DuplicateNode');

const activeLayer = josm.layers.activeLayer;
const ds = activeLayer.getDataSet();
const dsUtil = new DataSetUtil(ds);

const dupeNodesTest = new DupeNodesTest();

const nodesToTest = dsUtil.query("type:node and -deleted");
console.println(`nodes to test: ${nodesToTest.length}`);

dupeNodesTest.startTest(null);
for (const node of nodesToTest) {
    dupeNodesTest.visit(node);
}
dupeNodesTest.endTest();

const errors = dupeNodesTest.getErrors();

if (errors.length === 0) {
    console.println('no errors!');
}
else {
    let i = 0;
    console.println(`error count: ${errors.length}`);
    for (const error of errors) {

		const newNodes = error.getPrimitives().toArray().filter(x => x.isNew());

		for(const newNode of newNodes) {
			const ways = newNode.getParentWays().filter(x => x.get("release") !== null);
			ds.addSelected(ways);	
		}
    }
}
